#!/usr/bin/env node
/**
 * Launcher for Python Textual TUI
 * This spawns the Python TUI process
 */

import { spawn } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';

function findPythonCommand(): string {
  // Try different Python commands
  const commands = ['python3', 'python', 'py'];
  
  for (const cmd of commands) {
    try {
      const result = spawn(cmd, ['--version'], { stdio: 'pipe' });
      if (result) {
        return cmd;
      }
    } catch (e) {
      continue;
    }
  }
  
  return 'python3'; // Default fallback
}

function main() {
  const tuiPath = join(__dirname, 'tui.py');
  
  if (!existsSync(tuiPath)) {
    console.error('Error: tui.py not found at', tuiPath);
    console.error('Please ensure the Python TUI file exists.');
    process.exit(1);
  }
  
  const pythonCmd = findPythonCommand();
  
  console.log('Starting CozoDB Memory TUI...');
  console.log('Note: Requires Python 3.7+ and textual package');
  console.log('Install with: pip install textual\n');
  
  const tuiProcess = spawn(pythonCmd, [tuiPath], {
    stdio: 'inherit',
    shell: false
  });
  
  tuiProcess.on('error', (error) => {
    console.error('Failed to start TUI:', error.message);
    console.error('\nMake sure Python and textual are installed:');
    console.error('  pip install textual');
    process.exit(1);
  });
  
  tuiProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`\nTUI exited with code ${code}`);
      console.error('If you see import errors, install textual:');
      console.error('  pip install textual');
    }
    process.exit(code || 0);
  });
  
  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    tuiProcess.kill('SIGINT');
  });
}

main();
