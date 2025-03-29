#!/usr/bin/env node
// ListResourcesRequestSchema ,
// 
// 
// ReadResourceRequestSchema, 


// ListToolsRequestSchema => tell about list of tool 

// CallToolRequestSchema
//i want one more resource but it should be a text , not table schema ;
      // ,resources .append({
      //   uri: new URL(`/resources/prompt`, resourceBaseUrl).href,
      //   mimeType: "application/json",
      //   name: `system prompts`,
      //   //this will send the text to the client , in a string format
      // }),


import express from "express";
import pg from "pg";
import { v4 as uuidv4 } from "uuid"; // Using UUID for unique connection IDs


import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

// --- Configuration ---
import { DATABASE_URL } from "./config.js"; // Assuming this exports DATABASE_URL

const PORT = process.env.PORT || 3001;
const SSE_PATH = "/sse"; // Path for establishing SSE connection
const MESSAGE_PATH_PREFIX = "/messages"; // Prefix for incoming messages

// --- Database Setup ---
const databaseUrl = DATABASE_URL || process.argv[2];
if (!databaseUrl) {
  console.error(
    "DATABASE_URL is not set. Please set it as an environment variable or pass it as a command-line argument.",
  );
  process.exit(1);
}
console.log(`Using database: ${databaseUrl.replace(/:[^:]*@/, ':*****@')}`); // Mask password in log

let resourceBaseUrl: URL;
try {
  resourceBaseUrl = new URL(databaseUrl);
  resourceBaseUrl.protocol = "postgres:";
  resourceBaseUrl.password = ""; // Clear password for resource URIs
} catch (error) {
  console.error("Invalid DATABASE_URL format:", error);
  process.exit(1);
}


const pool = new pg.Pool({
  connectionString: databaseUrl,
});

// Test database connection
pool.connect()
  .then(client => {
    console.log("Database connection successful.");
    client.release();
  })
  .catch(err => {
    console.error("Database connection failed:", err);
    process.exit(1);
  });


// --- MCP Server Definition ---
const server = new Server(
  {
    name: "example-servers/postgres-sse",
    version: "0.1.1", // Updated version
  },
  {
    capabilities: {
      resources: {}, // Indicate resource capability
      tools: {},     // Indicate tool capability
    },
  },
);
const SCHEMA_PATH_SEGMENT = "schema"; // Use a constant for clarity

//ListResourcesRequestHandler
// ListResourcesRequestHandler
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  console.log("Handling ListResourcesRequest");
  const client = await pool.connect();
  try {
    const result = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    );
    return {
      resources: result.rows.map((row) => ({
        uri: new URL(`${row.table_name}/${SCHEMA_PATH_SEGMENT}`, resourceBaseUrl).href,
        mimeType: "application/json",
        name: `"${row.table_name}" database schema`,
      })),
    };
  } catch (error) {
    console.error("Error listing resources:", error);
    throw error; // Re-throw to let the server handle it
  } finally {
    client.release();
  }
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  console.log(`Handling ReadResourceRequest for URI: ${request.params.uri}`);
  let resourceUrl: URL;
  let tableName: string | undefined;
  try {
    resourceUrl = new URL(request.params.uri);
    const pathComponents = resourceUrl.pathname.split("/").filter(Boolean); // Filter empty segments
    const schemaSegment = pathComponents.pop();
    tableName = pathComponents.pop();

    if (schemaSegment !== SCHEMA_PATH_SEGMENT || !tableName) {
      throw new Error(`Invalid resource URI format. Expected '.../tableName/${SCHEMA_PATH_SEGMENT}'. Got: ${request.params.uri}`);
    }
  } catch (error) {
    console.error(`Error parsing resource URI '${request.params.uri}':`, error);
    // You might want to throw a specific MCP error type if available
    throw new Error(`Invalid resource URI: ${request.params.uri}`);
  }


  const client = await pool.connect();
  try {
    const result = await client.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position",
      [tableName],
    );

    if (result.rows.length === 0) {
      // Check if the table itself exists but has no columns (unlikely but possible)
      // or if the table doesn't exist
      const tableExistsResult = await client.query(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1)",
        [tableName]
      );
      if (!tableExistsResult.rows[0].exists) {
        throw new Error(`Resource not found: Table '${tableName}' does not exist.`);
      }
      // Table exists but no columns found (or maybe permissions issue)
      console.warn(`Table '${tableName}' found, but no columns returned from information_schema.`);
    }

    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType: "application/json",
          // Use JSON stringify for consistent formatting
          text: JSON.stringify(result.rows.map(row => ({ column: row.column_name, type: row.data_type })), null, 2),
        },
      ],
    };
  } catch (error) {
    console.error(`Error reading resource schema for table '${tableName}':`, error);
    throw error; // Re-throw
  } finally {
    client.release();
  }
});

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [{
      name: "system-prompt",
      description: `this is the baundary line for chat app to function properly`,
      arguments: [{
        name: "arg1",
        description: "",
      }]
    }]
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  if (request.params.name !== "example-prompt") {
    throw new Error("Unknown prompt");
  }
  return {
    description: "Example prompt",
    messages: [{
      role: "system",
      content: {
        type: "text",
        text: `You are an expert AI assistant specializing in Electric Vehicles (EVs). Your goal is to provide helpful information and guidance about EVs.
        You have access to a special tool called querry which can query a database of US EV registrations.

Tool Details:
- Name: querry
- Description: Use this tool to query the database for EV registrations.
- Input Schema: {"sql": "string"} (Provide the SQL query here)

**IMPORTANT RULES:**
1. Answer general EV questions directly based on your knowledge.
2. If a user asks for specific data, statistics, counts, lists, or trends related to EV registrations, sales, makes, models, years, or locations within the washington dc or specific washington dc county, you MUST use the "querry" tool.
3. When using the tool, first determine the correct SQL query based on the user's request and the known database schema.
4. The resources of the MCP server are:


before writing sql command be within this baundry of the sql schema is provided below : 
   \`\`\`sql
   CREATE TABLE vehicles (
  vin VARCHAR(10) PRIMARY KEY,
  county TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  model_year INT,
  make TEXT,
  model TEXT,
  electric_vehicle_type TEXT,
  cafv_eligibility TEXT,
  electric_range INT,
  base_msrp INT,
  legislative_district INT,
  dol_vehicle_id TEXT,
  vehicle_location TEXT,
  electric_utility TEXT,
  census_tract_2020 TEXT
);

   \`\`\` and another table schema is for no of ev charing station in washington dc / washington dc county:
   \`\`\`sql
   CREATE TABLE stations (
    County VARCHAR(255),
    No_of_EV_Charging_Stations INT
);

   \`\`\` 
   5. To trigger the tool, respond ONLY with a JSON object matching this exact structure:
   \`\`\`json
   {
     "tool_call": {
       "name": "querry",
       "arguments": {
         "sql": "YOUR_GENERATED_SQL_QUERY_HERE"
       }
     }
   }
   \`\`\`
6. Do NOT add any other text before or after this JSON structure when you intend to call the tool.
7. i am attaching some distinct value from the database table for "county" ,"electric_vehicle_type", which help you solve more problem and reasoning capacity;
   7.1 "electric_vehicle_type"
"Plug-in Hybrid Electric Vehicle (PHEV)"
"Battery Electric Vehicle (BEV)"

    7.2 "cafv_eligibility"
"Clean Alternative Fuel Vehicle Eligible"
"Eligibility unknown as battery range has not been researched"
"Not eligible due to low battery range"

    7.3 "county" : it has 67 distinct value;
"Kings","Jefferson","Grant","Cowlitz","Wahkiakum","Okanogan","Columbia","Kittitas","Wake","Walla Walla","Christian","Franklin","Maricopa","Ferry","Laramie","District of Columbia","Santa Clara","Pacific","Adams","Clallam","King","El Paso","Brevard","Lee","Pend Oreille","Chelan","San Juan","Benton","Snohomish","Asotin","Beaufort","Howard","Klickitat","Lincoln","Orange","Hardin","Grays Harbor","Pierce","Spokane","Meade","Harnett","Skamania","Whitman","Clark","Kitsap","Fairfax","Thurston","San Diego","Island","Mason","Skagit","DeKalb","Los Angeles","Anne Arundel","Douglas","Stevens","Lewis","Whatcom","Hamilton","Prince George's","San Mateo","Yakima","Currituck","Wasco","Calvert","Loudoun",

8. If the user's request for data is unclear or too broad, ask clarifying questions before attempting to generate SQL.
9. If the user asks for data outside the US washington dc, state that your database tool only covers washington dc and it's county.`

      }
    }]
  };
});


server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.log("Handling ListToolsRequest");
  return {
    tools: [
      {
        name: "query",
        description: "Run a read-only SQL query against the database.",
        inputSchema: {
          type: "object",
          properties: {
            sql: {
              type: "string",
              description: "The SQL query to execute (must be read-only)."
            },
          },
          required: ["sql"],
        },
        // Optional: Define output schema if known
        // outputSchema: { ... }
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  console.log(`Handling CallToolRequest for tool: ${request.params.name}`);
  if (request.params.name === "query") {
    // Validate input using the schema (basic check here)
    if (typeof request.params.arguments?.sql !== 'string' || !request.params.arguments.sql.trim()) {
      throw new Error("Missing or invalid 'sql' argument for 'query' tool.");
    }
    const sql = request.params.arguments.sql as string;

    // Basic check to prevent obviously non-read-only operations (can be improved)
    const upperSql = sql.toUpperCase();
    const forbiddenKeywords = ['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'TRUNCATE', 'GRANT', 'REVOKE'];
    if (forbiddenKeywords.some(keyword => upperSql.includes(keyword))) {
      throw new Error("Only read-only SQL queries are allowed.");
    }

    const client = await pool.connect();
    try {
      // Use a read-only transaction for safety
      await client.query("BEGIN TRANSACTION READ ONLY");
      console.log(`Executing SQL: ${sql}`);
      const result = await client.query(sql);
      await client.query("COMMIT"); // Commit the read-only transaction (ends it)
      return {
        // Return results as structured JSON text
        content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }],
        isError: false,
      };
    } catch (error: any) {
      console.error(`Error executing tool 'query' with SQL "${sql}":`, error);
      // Attempt to rollback if the transaction is still active
      await client.query("ROLLBACK").catch(rbError => console.warn("Rollback failed after query error:", rbError));
      // Return a structured error message
      return {
        content: [{ type: "text", text: `Error executing query: ${error.message}` }],
        isError: true,
      }
    } finally {
      client.release();
    }
  }
  // If tool name doesn't match
  throw new Error(`Unknown tool requested: ${request.params.name}`);
});

// --- Connection Management ---
// Store active transports, mapping a unique connection ID to the transport instance
const activeTransports = new Map<string, SSEServerTransport>();

// --- Express App Setup ---
const app = express();

// Middleware for parsing JSON bodies (useful if you add other non-MCP routes)
// app.use(express.json());
// Middleware for parsing text bodies (might be needed by handlePostMessage depending on content-type)
// You might not need both json and text depending on what clients send
// app.use(express.text());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// --- SSE Connection Endpoint ---
app.get(SSE_PATH, async (req, res) => {
  const connectionId = uuidv4();
  const clientIp = req.ip || req.socket.remoteAddress;
  console.log(`SSE connection received from ${clientIp}, assigning ID: ${connectionId}`);

  // Define the specific path for this client's POST messages
  const messagePath = `${MESSAGE_PATH_PREFIX}/${connectionId}`;
  // --- IMPORTANT: Ensure Response Headers for SSE ---
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();
  // Create a *new* transport for this specific connection
  const transport = new SSEServerTransport(
    messagePath, // Tell the transport where to expect POSTs for its messages
    res          // Pass the response object for SSE
  );

  // Store the transport instance using its unique ID
  activeTransports.set(connectionId, transport);
  console.log(`Transport created for ${connectionId}, message path: ${messagePath}`);
  console.log(`Active connections: ${activeTransports.size}`);

  // Handle client disconnection
  req.on("close", () => {
    console.log(`SSE connection closed for ID: ${connectionId} from ${clientIp}`);
    activeTransports.delete(connectionId); // Remove transport from map
    // transport.close(); // Usually not needed, closing res stream handles it
    console.log(`Active connections: ${activeTransports.size}`);
    // Optionally, you could notify the server if needed, but usually transport handles its lifecycle
    // server.disconnect(transport); // Check SDK if explicit disconnect is required
  });

  try {
    // Connect the main server logic to this specific client's transport
    // The server will now send messages *to* this client via this transport
    await server.connect(transport);
    console.log(`MCP Server connected to transport for ID: ${connectionId}`);
    res.write(': keepalive\n\n');
  } catch (error) {
    console.error(`Error connecting MCP Server to transport for ID ${connectionId}:`, error);
    // Ensure cleanup if connection fails
    activeTransports.delete(connectionId);
    if (!res.headersSent) {
      res.status(500).send("Failed to establish MCP connection");
    } else {
      res.write(`event: error\ndata: ${JSON.stringify({ message: "Failed to establish MCP connection" })}\n\n`);
      res.end(); // End the stream if headers were already sent
    }
  }
});

// --- Incoming Message Endpoint ---
// Use a dynamic route to capture the connectionId
app.post(`${MESSAGE_PATH_PREFIX}/:connectionId`, async (req, res) => {
  const { connectionId } = req.params;
  const clientIp = req.ip || req.socket.remoteAddress;

  // Find the correct transport instance for this connection ID
  const transport = activeTransports.get(connectionId);

  if (transport) {
    console.log(`Received POST message for connection ID: ${connectionId} from ${clientIp}`);
    try {
      // Let the specific transport instance handle the incoming request
      // This will parse the message and forward it to the MCP Server
      await transport.handlePostMessage(req, res);
      // handlePostMessage typically sends its own response
    } catch (error) {
      console.error(`Error handling POST message for ID ${connectionId}:`, error);
      if (!res.headersSent) {
        res.status(500).send("Error processing message");
      }
    }
  } else {
    // If no transport found for this ID (e.g., client disconnected, invalid ID)
    console.warn(`Received POST for unknown/disconnected connection ID: ${connectionId} from ${clientIp}`);
    res.status(404).send(`Connection ${connectionId} not found or has been closed.`);
  }
});

// --- Server Start ---
const listener = app.listen(PORT, () => {
  console.log(`MCP SSE server listening on http://localhost:${PORT}`);
  console.log(` -> SSE connections on: ${SSE_PATH}`);
  console.log(` -> POST messages to: ${MESSAGE_PATH_PREFIX}/<connectionId>`);
});

// --- Graceful Shutdown ---
const cleanup = async (signal: string) => {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);

  // 1. Stop accepting new connections
  listener.close(() => {
    console.log('HTTP server closed.');
  });

  // 2. Close active SSE connections (inform clients)
  console.log(`Closing ${activeTransports.size} active SSE connection(s)...`);
  activeTransports.forEach((transport, id) => {
    // transport.close(); // Check if transport has a close method or if closing res stream is enough
    console.log(`Closed transport for ${id}.`);
  });
  activeTransports.clear();

  // 3. Close the MCP server instance itself (if it has resources to release)
  try {
    await server.close(); // Assuming server.close() exists and is async
    console.log('MCP Server closed.');
  } catch (error) {
    console.error('Error closing MCP Server:', error);
  }


  // 4. Close the database pool
  try {
    await pool.end();
    console.log('Database pool closed.');
  } catch (error) {
    console.error('Error closing database pool:', error);
  }

  // 5. Exit process
  process.exit(0);
};

process.on('SIGINT', () => cleanup('SIGINT'));
process.on('SIGTERM', () => cleanup('SIGTERM'));