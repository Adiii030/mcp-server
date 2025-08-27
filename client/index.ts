import { AzureOpenAI } from "openai";
import {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import readline from "readline/promises";

import dotenv from "dotenv";

dotenv.config(); // load environment variables from .env

const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY;
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_OPENAI_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4";

if (!AZURE_OPENAI_API_KEY) {
  throw new Error("AZURE_OPENAI_API_KEY is not set");
}
if (!AZURE_OPENAI_ENDPOINT) {
  throw new Error("AZURE_OPENAI_ENDPOINT is not set");
}

class MCPClient {
  private mcp: Client;
  private openai: AzureOpenAI;
  private transport: StreamableHTTPClientTransport | null = null;
  private tools: ChatCompletionTool[] = [];

  constructor() {
    // Initialize Azure OpenAI client and MCP client
    this.openai = new AzureOpenAI({
      apiKey: AZURE_OPENAI_API_KEY,
      endpoint: AZURE_OPENAI_ENDPOINT,
      apiVersion: "2024-02-01",
    });
    this.mcp = new Client({ name: "mcp-client", version: "1.0.0" });
  }

  async connectToServer(serverUrl: string) {
    /**
     * Connect to an MCP server
     *
     * @param serverUrl - The MCP server URL
     */
    try {
      // Initialize transport and connect to server
      const url = new URL(serverUrl);
      this.transport = new StreamableHTTPClientTransport(url);
      await this.mcp.connect(this.transport);
      this.setUpTransport();

      // List available tools
      const toolsResult = await this.mcp.listTools();
      this.tools = toolsResult.tools.map((tool: any) => {
        return {
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
          },
        };
      });
      console.log(
        "Connected to server with tools:",
        this.tools.map((tool) => tool.function.name)
      );
    } catch (e) {
      console.log("Failed to connect to MCP server: ", e);
      throw e;
    }
  }

  private setUpTransport() {
    if (this.transport === null) {
      return;
    }
    this.transport.onclose = async () => {
      console.log("SSE transport closed.");
      await this.cleanup();
    };

    this.transport.onerror = async (error) => {
      console.log("SSE transport error: ", error);
      await this.cleanup();
    };
  }

  async processQuery(query: string) {
    /**
     * Process a query using Azure OpenAI and available tools
     *
     * @param query - The user's input query
     * @returns Processed response as a string
     */
    const messages: ChatCompletionMessageParam[] = [
      {
        role: "user",
        content: query,
      },
    ];

    // Initial Azure OpenAI API call
    const response = await this.openai.chat.completions.create({
      model: AZURE_OPENAI_DEPLOYMENT,
      max_tokens: 1000,
      messages,
      tools: this.tools,
      tool_choice: "auto",
    });

    // Process response and handle tool calls
    const finalText = [];
    const toolResults = [];

    const message = response.choices[0].message;
    
    if (message.content) {
      finalText.push(message.content);
    }

    if (message.tool_calls) {
      for (const toolCall of message.tool_calls) {
        // Execute tool call
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments || "{}");

        const result = await this.mcp.callTool({
          name: toolName,
          arguments: toolArgs,
        });
        toolResults.push(result);
        finalText.push(
          `[Calling tool ${toolName} with args ${JSON.stringify(toolArgs)}]`
        );

        // Add assistant message and tool result to conversation
        messages.push(message);
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result.content as string,
        });

        // Get next response from Azure OpenAI
        const followupResponse = await this.openai.chat.completions.create({
          model: AZURE_OPENAI_DEPLOYMENT,
          max_tokens: 1000,
          messages,
        });

        const followupMessage = followupResponse.choices[0].message;
        if (followupMessage.content) {
          finalText.push(followupMessage.content);
        }
      }
    }

    return finalText.join("\n");
  }

  async chatLoop() {
    /**
     * Run an interactive chat loop
     */
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      console.log("Type your queries or 'quit' to exit.");

      while (true) {
        const message = await rl.question("\nQuery: ");
        if (message.toLowerCase() === "quit") {
          break;
        }
        const response = await this.processQuery(message);
        console.log("\n" + response);
      }
    } finally {
      rl.close();
    }
  }

  async cleanup() {
    /**
     * Clean up resources
     */
    await this.mcp.close();
  }
}

async function main() {
  // Default port
  let port = 8123;

  // Parse command-line arguments
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];

    if (arg.startsWith("--mcp-localhost-port=")) {
      const value = parseInt(arg.split("=")[1], 10);
      if (!isNaN(value)) {
        port = value;
      } else {
        console.error("Invalid value for --mcp-localhost-port");
        process.exit(1);
      }
    }
  }

  const mcpClient = new MCPClient();
  try {
    await mcpClient.connectToServer(`http://localhost:${port}/mcp`);
    await mcpClient.chatLoop();
  } finally {
    await mcpClient.cleanup();
    process.exit(0);
  }
}

main();
