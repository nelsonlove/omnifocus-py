"""MCP server for OmniFocus."""
from mcp.server.fastmcp import FastMCP
from omnifocus_mcp.client import OmniFocusClient

mcp = FastMCP("OmniFocus", json_response=True)
client = OmniFocusClient()

def main():
    mcp.run(transport="stdio")

if __name__ == "__main__":
    main()
