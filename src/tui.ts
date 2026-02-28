#!/usr/bin/env node
/**
 * Modern TUI for CozoDB Memory using Ink (React for CLI)
 * Usage: cozo-memory-tui
 * 
 * Note: This requires dynamic import due to Ink being ESM-only
 */

async function main() {
  try {
    // Dynamic import for ESM modules
    const { render, Box, Text, useInput, useApp } = await import('ink');
    const React = await import('react');
    const { CLICommands } = await import('./cli-commands.js');

    const { useState, useEffect } = React;

    type Screen = 'menu' | 'entity' | 'profile' | 'search' | 'graph' | 'system' | 'result';

    interface AppState {
      screen: Screen;
      selectedIndex: number;
      result: any;
      loading: boolean;
      error: string | null;
    }

    const cli = new CLICommands();
    let initialized = false;

    const App: React.FC = () => {
      const { exit } = useApp();
      const [state, setState] = useState<AppState>({
        screen: 'menu',
        selectedIndex: 0,
        result: null,
        loading: false,
        error: null
      });

      useEffect(() => {
        const initCLI = async () => {
          if (!initialized) {
            try {
              await cli.init();
              initialized = true;
            } catch (error: any) {
              setState(prev => ({ ...prev, error: error.message }));
            }
          }
        };
        initCLI();

        return () => {
          if (initialized) {
            cli.close();
          }
        };
      }, []);

      useInput((input, key) => {
        if (input === 'q' || (key.ctrl && input === 'c')) {
          exit();
          return;
        }

        if (key.escape) {
          setState(prev => ({ ...prev, screen: 'menu', selectedIndex: 0, result: null, error: null }));
          return;
        }

        if (state.screen === 'menu') {
          if (key.upArrow) {
            setState(prev => ({
              ...prev,
              selectedIndex: Math.max(0, prev.selectedIndex - 1)
            }));
          } else if (key.downArrow) {
            setState(prev => ({
              ...prev,
              selectedIndex: Math.min(6, prev.selectedIndex + 1)
            }));
          } else if (key.return) {
            const screens: Screen[] = ['entity', 'profile', 'search', 'graph', 'system', 'result', 'menu'];
            const newScreen = screens[state.selectedIndex];
            
            if (state.selectedIndex === 5) {
              setState(prev => ({ ...prev, loading: true }));
              cli.health().then(result => {
                setState(prev => ({ ...prev, screen: 'result', result, loading: false }));
              }).catch(error => {
                setState(prev => ({ ...prev, error: error.message, loading: false }));
              });
            } else {
              setState(prev => ({ ...prev, screen: newScreen }));
            }
          }
        }
      });

      if (state.loading) {
        return React.createElement(Box, { flexDirection: 'column', padding: 1 },
          React.createElement(Text, { color: 'yellow' }, '⏳ Loading...')
        );
      }

      if (state.error) {
        return React.createElement(Box, { flexDirection: 'column', padding: 1 },
          React.createElement(Text, { color: 'red' }, `❌ Error: ${state.error}`),
          React.createElement(Text, { dimColor: true }, 'Press ESC to return to menu')
        );
      }

      return React.createElement(Box, { flexDirection: 'column', padding: 1 },
        React.createElement(Header),
        state.screen === 'menu' && React.createElement(MainMenu, { selectedIndex: state.selectedIndex }),
        state.screen === 'entity' && React.createElement(EntityScreen),
        state.screen === 'profile' && React.createElement(ProfileScreen),
        state.screen === 'search' && React.createElement(SearchScreen),
        state.screen === 'graph' && React.createElement(GraphScreen),
        state.screen === 'system' && React.createElement(SystemScreen),
        state.screen === 'result' && React.createElement(ResultScreen, { result: state.result }),
        React.createElement(Footer)
      );
    };

    const Header: React.FC = () => 
      React.createElement(Box, { 
        flexDirection: 'column', 
        marginBottom: 1, 
        borderStyle: 'round', 
        borderColor: 'cyan', 
        padding: 1 
      },
        React.createElement(Text, { bold: true, color: 'cyan' }, '🧠 CozoDB Memory - Interactive TUI'),
        React.createElement(Text, { dimColor: true }, 'Local-first persistent memory for AI agents')
      );

    const Footer: React.FC = () =>
      React.createElement(Box, { 
        marginTop: 1, 
        borderStyle: 'single', 
        borderColor: 'gray', 
        padding: 1 
      },
        React.createElement(Text, { dimColor: true }, '↑↓: Navigate | Enter: Select | ESC: Back | Q: Quit')
      );

    interface MainMenuProps {
      selectedIndex: number;
    }

    const MainMenu: React.FC<MainMenuProps> = ({ selectedIndex }) => {
      const menuItems = [
        { icon: '📦', label: 'Entity Operations', desc: 'Create, read, update, delete entities' },
        { icon: '👤', label: 'User Profile', desc: 'Manage user preferences and profile' },
        { icon: '🔍', label: 'Search & Context', desc: 'Hybrid search, context retrieval' },
        { icon: '🕸️', label: 'Graph Operations', desc: 'Explore, PageRank, communities' },
        { icon: '⚙️', label: 'System Management', desc: 'Health, metrics, export/import' },
        { icon: '💚', label: 'Quick Health Check', desc: 'Run system health check' },
        { icon: '❌', label: 'Exit', desc: 'Quit application' }
      ];

      return React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Box, { marginBottom: 1 },
          React.createElement(Text, { bold: true, color: 'yellow' }, 'Main Menu')
        ),
        ...menuItems.map((item, index) =>
          React.createElement(Box, { key: index, marginLeft: 2 },
            React.createElement(Text, { color: selectedIndex === index ? 'green' : 'white' },
              `${selectedIndex === index ? '▶ ' : '  '}${item.icon} ${item.label}`
            ),
            selectedIndex === index && React.createElement(Text, { dimColor: true }, ` - ${item.desc}`)
          )
        )
      );
    };

    const EntityScreen: React.FC = () =>
      React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true, color: 'cyan' }, '📦 Entity Operations'),
        React.createElement(Box, { marginTop: 1, flexDirection: 'column', marginLeft: 2 },
          React.createElement(Text, null, '• Create Entity: ', React.createElement(Text, { dimColor: true }, 'cozo-memory entity create -n "Name" -t "Type"')),
          React.createElement(Text, null, '• Get Entity: ', React.createElement(Text, { dimColor: true }, 'cozo-memory entity get -i <id>')),
          React.createElement(Text, null, '• Delete Entity: ', React.createElement(Text, { dimColor: true }, 'cozo-memory entity delete -i <id>')),
          React.createElement(Text, null, '• Add Observation: ', React.createElement(Text, { dimColor: true }, 'cozo-memory obs add -i <id> -t "Text"'))
        ),
        React.createElement(Box, { marginTop: 1 },
          React.createElement(Text, { color: 'yellow' }, '💡 Use the CLI commands shown above for entity operations')
        )
      );

    const ProfileScreen: React.FC = () =>
      React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true, color: 'cyan' }, '👤 User Profile Management'),
        React.createElement(Box, { marginTop: 1, flexDirection: 'column', marginLeft: 2 },
          React.createElement(Text, null, '• Show Profile: ', React.createElement(Text, { dimColor: true }, 'cozo-memory profile show')),
          React.createElement(Text, null, '• Update Metadata: ', React.createElement(Text, { dimColor: true }, 'cozo-memory profile update -m \'{"key":"value"}\'')),
          React.createElement(Text, null, '• Add Preference: ', React.createElement(Text, { dimColor: true }, 'cozo-memory profile add-preference -t "I prefer TypeScript"')),
          React.createElement(Text, null, '• Reset Preferences: ', React.createElement(Text, { dimColor: true }, 'cozo-memory profile reset'))
        ),
        React.createElement(Box, { marginTop: 1 },
          React.createElement(Text, { color: 'yellow' }, '💡 User profile preferences get 50% search boost automatically')
        )
      );

    const SearchScreen: React.FC = () =>
      React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true, color: 'cyan' }, '🔍 Search & Context'),
        React.createElement(Box, { marginTop: 1, flexDirection: 'column', marginLeft: 2 },
          React.createElement(Text, null, '• Search: ', React.createElement(Text, { dimColor: true }, 'cozo-memory search query -q "your query"')),
          React.createElement(Text, null, '• Context: ', React.createElement(Text, { dimColor: true }, 'cozo-memory search context -q "query" -w 5')),
          React.createElement(Text, null, '• Advanced: ', React.createElement(Text, { dimColor: true }, 'With filters, entity types, time ranges'))
        ),
        React.createElement(Box, { marginTop: 1 },
          React.createElement(Text, { color: 'yellow' }, '💡 Hybrid search combines vector, keyword, and graph signals')
        )
      );

    const GraphScreen: React.FC = () =>
      React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true, color: 'cyan' }, '🕸️ Graph Operations'),
        React.createElement(Box, { marginTop: 1, flexDirection: 'column', marginLeft: 2 },
          React.createElement(Text, null, '• Explore: ', React.createElement(Text, { dimColor: true }, 'cozo-memory graph explore -s <id> -h 3')),
          React.createElement(Text, null, '• PageRank: ', React.createElement(Text, { dimColor: true }, 'cozo-memory graph pagerank')),
          React.createElement(Text, null, '• Communities: ', React.createElement(Text, { dimColor: true }, 'cozo-memory graph communities')),
          React.createElement(Text, null, '• Path Finding: ', React.createElement(Text, { dimColor: true }, 'cozo-memory graph explore -s <id1> -e <id2>'))
        ),
        React.createElement(Box, { marginTop: 1 },
          React.createElement(Text, { color: 'yellow' }, '💡 Graph algorithms help discover implicit relationships')
        )
      );

    const SystemScreen: React.FC = () =>
      React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true, color: 'cyan' }, '⚙️ System Management'),
        React.createElement(Box, { marginTop: 1, flexDirection: 'column', marginLeft: 2 },
          React.createElement(Text, null, '• Health: ', React.createElement(Text, { dimColor: true }, 'cozo-memory system health')),
          React.createElement(Text, null, '• Metrics: ', React.createElement(Text, { dimColor: true }, 'cozo-memory system metrics')),
          React.createElement(Text, null, '• Export JSON: ', React.createElement(Text, { dimColor: true }, 'cozo-memory export json -o backup.json')),
          React.createElement(Text, null, '• Export Markdown: ', React.createElement(Text, { dimColor: true }, 'cozo-memory export markdown -o notes.md')),
          React.createElement(Text, null, '• Export Obsidian: ', React.createElement(Text, { dimColor: true }, 'cozo-memory export obsidian -o vault.zip')),
          React.createElement(Text, null, '• Import: ', React.createElement(Text, { dimColor: true }, 'cozo-memory import file -i data.json -f cozo'))
        ),
        React.createElement(Box, { marginTop: 1 },
          React.createElement(Text, { color: 'yellow' }, '💡 Regular exports recommended for backup')
        )
      );

    interface ResultScreenProps {
      result: any;
    }

    const ResultScreen: React.FC<ResultScreenProps> = ({ result }) =>
      React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true, color: 'green' }, '✓ Result'),
        React.createElement(Box, { marginTop: 1, borderStyle: 'round', borderColor: 'green', padding: 1 },
          React.createElement(Text, null, JSON.stringify(result, null, 2))
        )
      );

    render(React.createElement(App));
  } catch (error: any) {
    console.error('Failed to start TUI:', error.message);
    console.error('Make sure all dependencies are installed: npm install');
    process.exit(1);
  }
}

main();
