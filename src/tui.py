#!/usr/bin/env python3
"""
Modern TUI for CozoDB Memory using Textual
Features: Mouse support, interactive menus, real-time updates
"""

from textual.app import App, ComposeResult
from textual.containers import Container, Horizontal, Vertical, ScrollableContainer
from textual.widgets import Header, Footer, Button, Static, Input, Tree, Label, DataTable, TabbedContent, TabPane
from textual.binding import Binding
from textual import events
import subprocess
import json
import sys
from pathlib import Path

class CozoMemoryTUI(App):
    """Textual TUI for CozoDB Memory"""
    
    CSS = """
    Screen {
        background: $surface;
    }
    
    #sidebar {
        width: 30;
        background: $panel;
        border-right: solid $primary;
    }
    
    #main-content {
        width: 1fr;
        padding: 1 2;
    }
    
    Button {
        width: 100%;
        margin: 1 0;
    }
    
    .success {
        color: $success;
    }
    
    .error {
        color: $error;
    }
    
    .info {
        color: $accent;
    }
    
    #result-container {
        height: 1fr;
        border: solid $primary;
        padding: 1;
        margin-top: 1;
    }
    
    Input {
        margin: 1 0;
    }
    
    Label {
        margin: 1 0;
    }
    
    DataTable {
        height: 1fr;
    }
    """
    
    BINDINGS = [
        Binding("q", "quit", "Quit"),
        Binding("h", "show_help", "Help"),
        Binding("r", "refresh", "Refresh"),
    ]
    
    def __init__(self):
        super().__init__()
        self.cli_path = self._find_cli_path()
        
    def _find_cli_path(self) -> str:
        """Find the cozo-memory CLI executable"""
        # Try different locations
        possible_paths = [
            Path(__file__).parent.parent / "dist" / "cli.js",
            Path.cwd() / "dist" / "cli.js",
        ]
        
        for path in possible_paths:
            if path.exists():
                return str(path)
        
        # Fallback to global installation
        return "cozo-memory"
    
    def compose(self) -> ComposeResult:
        """Create child widgets"""
        yield Header(show_clock=True)
        
        with Horizontal():
            # Sidebar with navigation
            with Vertical(id="sidebar"):
                yield Static("🧠 CozoDB Memory", classes="info")
                yield Button("⚙️ System Tools", id="btn-system", variant="primary")
                yield Button("👤 User Profile", id="btn-profile")
                yield Button("➕ Create Entity", id="btn-create-entity")
                yield Button("🔍 Search", id="btn-search")
                yield Button("🕸️ Graph Operations", id="btn-graph")
                yield Button("📤 Export", id="btn-export")
                yield Button("📥 Import", id="btn-import")
                yield Button("📋 List Entities", id="btn-list")
            
            # Main content area
            with ScrollableContainer(id="main-content"):
                yield Static("Welcome to CozoDB Memory TUI", id="welcome-text", classes="info")
                yield Static("Click a button or use keyboard shortcuts", id="help-text")
                
                # Dynamic content container
                with Container(id="result-container"):
                    yield Static("Results will appear here...", id="result-text")
        
        yield Footer()
    
    def _run_cli_command(self, *args, use_json_format: bool = True) -> dict:
        """Execute CLI command and return JSON result"""
        try:
            cmd = ["node", self.cli_path] + list(args)
            # Only add -f json for commands that support it
            if use_json_format:
                cmd.extend(["-f", "json"])
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode != 0:
                return {"error": result.stderr or "Command failed"}
            
            # Parse JSON output - stdout should be pure JSON
            if use_json_format:
                try:
                    # Parse the JSON directly from stdout
                    parsed = json.loads(result.stdout)
                    return {"success": True, "data": parsed}
                except json.JSONDecodeError as e:
                    # If JSON parsing fails, return error with details
                    return {"error": f"Failed to parse JSON: {str(e)}\nOutput: {result.stdout[:200]}"}
            else:
                # For non-JSON commands, return raw output
                return {"success": True, "data": {"output": result.stdout}}
                
        except subprocess.TimeoutExpired:
            return {"error": "Command timed out"}
        except Exception as e:
            return {"error": str(e)}
    
    def _update_result(self, data: dict):
        """Update the result container with new data"""
        # Always recreate the Static widget to avoid markup issues
        container = self.query_one("#result-container", Container)
        container.remove_children()
        
        if "error" in data:
            # Show error without markup
            content = f"ERROR:\n{data['error']}"
        elif "success" in data and data["success"]:
            # Format the data nicely
            formatted = json.dumps(data["data"], indent=2)
            # Truncate if too long
            if len(formatted) > 5000:
                formatted = formatted[:5000] + "\n... (truncated)"
            content = f"SUCCESS:\n{formatted}"
        else:
            # Fallback
            formatted = json.dumps(data, indent=2)
            content = formatted
        
        # Create new Static widget with markup disabled
        result_text = Static(content, id="result-text", markup=False)
        container.mount(result_text)
    

    
    async def action_show_health(self) -> None:
        """Show system health"""
        self.query_one("#welcome-text", Static).update("📊 System Health")
        result = self._run_cli_command("system", "health")
        self._update_result(result)
    
    async def action_system_menu(self) -> None:
        """Show system operations menu"""
        self.query_one("#welcome-text", Static).update("⚙️ System Tools")
        
        container = self.query_one("#result-container", Container)
        await container.remove_children()
        
        await container.mount(
            Static("Select a system operation:", classes="info"),
            Button("📊 System Health", id="btn-sys-health"),
            Button("📈 System Metrics", id="btn-sys-metrics"),
            Button("🤔 Reflect (Self-Improvement)", id="btn-sys-reflect")
        )
    
    async def action_create_entity(self) -> None:
        """Show create entity form"""
        self.query_one("#welcome-text", Static).update("➕ Create Entity")
        
        # Replace result container with form
        container = self.query_one("#result-container", Container)
        await container.remove_children()
        
        await container.mount(
            Label("Entity Name:"),
            Input(placeholder="Enter entity name", id="input-name"),
            Label("Entity Type:"),
            Input(placeholder="Enter entity type", id="input-type"),
            Label("Metadata (JSON, optional):"),
            Input(placeholder='{"key": "value"}', id="input-metadata"),
            Button("Create", id="btn-submit-entity", variant="success")
        )
    
    async def action_search(self) -> None:
        """Show search form"""
        self.query_one("#welcome-text", Static).update("🔍 Search Memory")
        
        container = self.query_one("#result-container", Container)
        await container.remove_children()
        
        await container.mount(
            Label("Search Query:"),
            Input(placeholder="Enter search query", id="input-search-query"),
            Label("Limit (optional):"),
            Input(placeholder="10", id="input-search-limit"),
            Button("Standard Search", id="btn-submit-search", variant="primary"),
            Button("🤖 Agentic Search", id="btn-submit-agentic", variant="success")
        )

    
    async def action_graph_menu(self) -> None:
        """Show graph operations menu"""
        self.query_one("#welcome-text", Static).update("🕸️ Graph Operations")
        
        container = self.query_one("#result-container", Container)
        await container.remove_children()
        
        await container.mount(
            Static("Select a graph operation:", classes="info"),
            Button("📊 PageRank", id="btn-graph-pagerank"),
            Button("🏘️ Communities", id="btn-graph-communities"),
            Button("📝 Summarize Communities", id="btn-graph-summarize"),
            Button("🔍 Explore from Entity", id="btn-graph-explore")
        )
    
    async def action_export_menu(self) -> None:
        """Show export menu"""
        self.query_one("#welcome-text", Static).update("📤 Export Memory")
        
        container = self.query_one("#result-container", Container)
        await container.remove_children()
        
        await container.mount(
            Static("Select export format:", classes="info"),
            Label("Output File:"),
            Input(placeholder="export.json", id="input-export-file"),
            Button("Export as JSON", id="btn-export-json"),
            Button("Export as Markdown", id="btn-export-md"),
            Button("Export as Obsidian ZIP", id="btn-export-obsidian")
        )
    
    async def action_import_menu(self) -> None:
        """Show import menu"""
        self.query_one("#welcome-text", Static).update("📥 Import Memory")
        
        container = self.query_one("#result-container", Container)
        await container.remove_children()
        
        await container.mount(
            Static("Import data from file:", classes="info"),
            Label("Input File:"),
            Input(placeholder="import.json", id="input-import-file"),
            Label("Format:"),
            Input(placeholder="cozo", id="input-import-format"),
            Button("Import", id="btn-submit-import", variant="warning")
        )
    
    async def action_list_entities(self) -> None:
        """List all entities"""
        self.query_one("#welcome-text", Static).update("📋 Entity List")
        
        # Get health to show entity count
        result = self._run_cli_command("system", "health")
        
        container = self.query_one("#result-container", Container)
        await container.remove_children()
        
        if "success" in result and result["success"]:
            health_data = result["data"]
            await container.mount(
                Static(f"Total Entities: {health_data.get('entities', 0)}"),
                Static(f"Total Observations: {health_data.get('observations', 0)}"),
                Static(f"Total Relationships: {health_data.get('relationships', 0)}"),
                Static("\nUse CLI to get detailed entity list:\ncozo-memory entity get -i <entity-id>")
            )
        else:
            await container.mount(Static(f"Error: {result.get('error', 'Unknown error')}"))
    
    async def action_profile_menu(self) -> None:
        """Show user profile menu"""
        self.query_one("#welcome-text", Static).update("👤 User Profile")
        
        container = self.query_one("#result-container", Container)
        await container.remove_children()
        
        await container.mount(
            Static("User Profile Management:", classes="info"),
            Button("📋 Show Profile", id="btn-profile-show"),
            Button("✏️ Update Metadata", id="btn-profile-update"),
            Button("➕ Add Preference", id="btn-profile-add-pref"),
            Button("🔄 Reset Preferences", id="btn-profile-reset")
        )
    
    async def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle all button presses"""
        button_id = event.button.id
        
        # Main menu buttons
        if button_id == "btn-system":
            await self.action_system_menu()
        elif button_id == "btn-profile":
            await self.action_profile_menu()
        elif button_id == "btn-create-entity":
            await self.action_create_entity()
        elif button_id == "btn-search":
            await self.action_search()
        elif button_id == "btn-graph":
            await self.action_graph_menu()
        elif button_id == "btn-export":
            await self.action_export_menu()
        elif button_id == "btn-import":
            await self.action_import_menu()
        elif button_id == "btn-list":
            await self.action_list_entities()
            
        # System submenu buttons
        elif button_id == "btn-sys-health":
            await self.action_show_health()
        elif button_id == "btn-sys-metrics":
            await self.handle_sys_metrics()
        elif button_id == "btn-sys-reflect":
            await self.action_sys_reflect_form()
            
        # Profile submenu buttons
        elif button_id == "btn-profile-show":
            await self.handle_profile_show()
        elif button_id == "btn-profile-update":
            await self.action_profile_update_form()
        elif button_id == "btn-profile-add-pref":
            await self.action_profile_add_pref_form()
        elif button_id == "btn-profile-reset":
            await self.handle_profile_reset()
        
        # Form submission buttons
        elif button_id == "btn-submit-entity":
            await self.handle_create_entity()
        elif button_id == "btn-submit-search":
            await self.handle_search()
        elif button_id == "btn-submit-profile-update":
            await self.handle_profile_update()
        elif button_id == "btn-submit-profile-pref":
            await self.handle_profile_add_pref()
        elif button_id == "btn-submit-import":
            await self.handle_import()
        elif button_id == "btn-submit-agentic":
            await self.handle_agentic_search()
        elif button_id == "btn-submit-reflect":
            await self.handle_sys_reflect()
        
        # Graph operation buttons
        elif button_id == "btn-graph-pagerank":
            await self.handle_graph_pagerank()
        elif button_id == "btn-graph-communities":
            await self.handle_graph_communities()
        elif button_id == "btn-graph-summarize":
            await self.handle_graph_summarize()
        elif button_id == "btn-graph-explore":
            await self.handle_graph_explore_form()
        
        # Export buttons
        elif button_id == "btn-export-json":
            await self.handle_export("json")
        elif button_id == "btn-export-md":
            await self.handle_export("markdown")
        elif button_id == "btn-export-obsidian":
            await self.handle_export("obsidian")
        
        # Graph explore submit
        elif button_id == "btn-submit-explore":
            await self.handle_graph_explore()
    
    async def handle_create_entity(self) -> None:
        """Handle entity creation form submission"""
        name = self.query_one("#input-name", Input).value
        entity_type = self.query_one("#input-type", Input).value
        metadata = self.query_one("#input-metadata", Input).value
        
        if not name or not entity_type:
            self._update_result({"error": "Name and type are required"})
            return
        
        args = ["entity", "create", "-n", name, "-t", entity_type]
        if metadata:
            args.extend(["-m", metadata])
        
        result = self._run_cli_command(*args)
        self._update_result(result)
    
    async def handle_search(self) -> None:
        """Handle search form submission"""
        query = self.query_one("#input-search-query", Input).value
        limit = self.query_one("#input-search-limit", Input).value
        
        if not query:
            self._update_result({"error": "Search query is required"})
            return
        
        args = ["search", "query", "-q", query]
        if limit:
            args.extend(["-l", limit])
        
        result = self._run_cli_command(*args)
        self._update_result(result)

    async def handle_agentic_search(self) -> None:
        """Handle agentic search form submission"""
        query = self.query_one("#input-search-query", Input).value
        limit = self.query_one("#input-search-limit", Input).value
        
        if not query:
            self._update_result({"error": "Search query is required"})
            return
        
        args = ["search", "agentic", "-q", query]
        if limit:
            args.extend(["-l", limit])
        
        self.query_one("#welcome-text", Static).update("🤖 Agentic Search Running...")
        result = self._run_cli_command(*args)
        self._update_result(result)
    
    async def handle_import(self) -> None:
        """Handle import form submission"""
        file_path = self.query_one("#input-import-file", Input).value
        format_type = self.query_one("#input-import-format", Input).value
        
        if not file_path:
            self._update_result({"error": "File path is required"})
            return
        
        args = ["import", "file", "-i", file_path, "-f", format_type or "cozo"]
        # Import commands don't use -f json format
        result = self._run_cli_command(*args, use_json_format=False)
        self._update_result(result)
    
    async def handle_graph_pagerank(self) -> None:
        """Execute PageRank"""
        self.query_one("#welcome-text", Static).update("📊 Computing PageRank...")
        result = self._run_cli_command("graph", "pagerank")
        self._update_result(result)
    
    async def handle_graph_communities(self) -> None:
        """Execute community detection"""
        self.query_one("#welcome-text", Static).update("🏘️ Detecting Communities...")
        result = self._run_cli_command("graph", "communities")
        self._update_result(result)
        
    async def handle_graph_summarize(self) -> None:
        """Execute community summarization"""
        self.query_one("#welcome-text", Static).update("📝 Summarizing Communities (GraphRAG)...")
        result = self._run_cli_command("graph", "summarize")
        self._update_result(result)
    
    async def handle_graph_explore_form(self) -> None:
        """Show graph explore form"""
        container = self.query_one("#result-container", Container)
        await container.remove_children()
        
        await container.mount(
            Label("Start Entity ID:"),
            Input(placeholder="Enter entity ID", id="input-explore-start"),
            Label("Max Hops:"),
            Input(placeholder="3", id="input-explore-hops"),
            Button("Explore", id="btn-submit-explore", variant="primary")
        )
    
    async def handle_graph_explore(self) -> None:
        """Execute graph exploration"""
        start_id = self.query_one("#input-explore-start", Input).value
        hops = self.query_one("#input-explore-hops", Input).value
        
        if not start_id:
            self._update_result({"error": "Start entity ID is required"})
            return
        
        args = ["graph", "explore", "-s", start_id]
        if hops:
            args.extend(["-h", hops])
        
        result = self._run_cli_command(*args)
        self._update_result(result)
        
    async def handle_sys_metrics(self) -> None:
        """Show system metrics"""
        self.query_one("#welcome-text", Static).update("📈 System Metrics")
        result = self._run_cli_command("system", "metrics")
        self._update_result(result)
        
    async def action_sys_reflect_form(self) -> None:
        """Show system reflect form"""
        self.query_one("#welcome-text", Static).update("🤔 Reflect (Self-Improvement)")
        
        container = self.query_one("#result-container", Container)
        await container.remove_children()
        
        await container.mount(
            Label("Entity ID (optional, leave blank for global reflection):"),
            Input(placeholder="Enter entity ID", id="input-reflect-id"),
            Button("Run Reflection", id="btn-submit-reflect", variant="primary")
        )
        
    async def handle_sys_reflect(self) -> None:
        """Handle system reflect submission"""
        entity_id = self.query_one("#input-reflect-id", Input).value
        
        args = ["system", "reflect"]
        if entity_id:
            args.extend(["-i", entity_id])
            
        self.query_one("#welcome-text", Static).update("🤔 Running Reflection...")
        result = self._run_cli_command(*args)
        self._update_result(result)
    
    async def handle_export(self, format_type: str) -> None:
        """Handle export"""
        file_input = self.query_one("#input-export-file", Input)
        file_path = file_input.value or f"export.{format_type}"
        
        if format_type == "json":
            args = ["export", "json", "-o", file_path, "--include-metadata", "--include-relationships", "--include-observations"]
        elif format_type == "markdown":
            args = ["export", "markdown", "-o", file_path]
        else:  # obsidian
            args = ["export", "obsidian", "-o", file_path]
        
        # Export commands don't use -f json format
        result = self._run_cli_command(*args, use_json_format=False)
        if "success" in result and result["success"]:
            result = {"success": True, "data": {"message": f"Exported to {file_path}"}}
        self._update_result(result)
    
    def action_show_help(self) -> None:
        """Show help information"""
        self.query_one("#welcome-text", Static).update("❓ Help")
        help_text = """
[bold cyan]Keyboard Shortcuts:[/bold cyan]
• q - Quit application
• h - Show this help
• r - Refresh current view

[bold cyan]Mouse Support:[/bold cyan]
• Click buttons to navigate
• Scroll with mouse wheel
• Click input fields to type

[bold cyan]CLI Commands:[/bold cyan]
All operations can also be done via CLI:
• cozo-memory entity create -n "Name" -t "type"
• cozo-memory search query -q "search term"
• cozo-memory graph pagerank
• cozo-memory export json -o backup.json
        """
        container = self.query_one("#result-container", Container)
        container.remove_children()
        container.mount(Static(help_text))
    
    def action_refresh(self) -> None:
        """Refresh current view"""
        self.query_one("#welcome-text", Static).update("🔄 Refreshed")
        self.action_show_health()
    
    async def handle_profile_show(self) -> None:
        """Show user profile"""
        result = self._run_cli_command("profile", "show")
        self._update_result(result)
    
    async def action_profile_update_form(self) -> None:
        """Show profile update form"""
        self.query_one("#welcome-text", Static).update("✏️ Update Profile Metadata")
        
        container = self.query_one("#result-container", Container)
        await container.remove_children()
        
        await container.mount(
            Label("Profile Name (optional):"),
            Input(placeholder="Developer Profile", id="input-profile-name"),
            Label("Profile Type (optional):"),
            Input(placeholder="UserProfile", id="input-profile-type"),
            Label("Metadata (JSON, optional):"),
            Input(placeholder='{"timezone": "Europe/Berlin"}', id="input-profile-metadata"),
            Button("Update", id="btn-submit-profile-update", variant="success")
        )
    
    async def action_profile_add_pref_form(self) -> None:
        """Show add preference form"""
        self.query_one("#welcome-text", Static).update("➕ Add Preference")
        
        container = self.query_one("#result-container", Container)
        await container.remove_children()
        
        await container.mount(
            Label("Preference Text:"),
            Input(placeholder="I prefer TypeScript over JavaScript", id="input-pref-text"),
            Label("Metadata (JSON, optional):"),
            Input(placeholder='{"category": "tech_stack"}', id="input-pref-metadata"),
            Button("Add Preference", id="btn-submit-profile-pref", variant="success")
        )
    
    async def handle_profile_update(self) -> None:
        """Handle profile update"""
        name_input = self.query_one("#input-profile-name", Input)
        type_input = self.query_one("#input-profile-type", Input)
        metadata_input = self.query_one("#input-profile-metadata", Input)
        
        args = ["profile", "update"]
        
        if name_input.value:
            args.extend(["-n", name_input.value])
        if type_input.value:
            args.extend(["-t", type_input.value])
        if metadata_input.value:
            args.extend(["-m", metadata_input.value])
        
        if len(args) == 2:
            self._update_result({"error": "At least one field must be provided"})
            return
        
        result = self._run_cli_command(*args)
        self._update_result(result)
    
    async def handle_profile_add_pref(self) -> None:
        """Handle add preference"""
        text_input = self.query_one("#input-pref-text", Input)
        metadata_input = self.query_one("#input-pref-metadata", Input)
        
        if not text_input.value:
            self._update_result({"error": "Preference text is required"})
            return
        
        args = ["profile", "add-preference", "-t", text_input.value]
        
        if metadata_input.value:
            args.extend(["-m", metadata_input.value])
        
        result = self._run_cli_command(*args)
        self._update_result(result)
    
    async def handle_profile_reset(self) -> None:
        """Handle profile reset"""
        result = self._run_cli_command("profile", "reset")
        self._update_result(result)


if __name__ == "__main__":
    app = CozoMemoryTUI()
    app.run()
