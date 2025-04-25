import * as vscode from 'vscode';

// Global map to store status bar items by workspace folder name
const statusBars: Map<string, vscode.StatusBarItem> = new Map();

/**
 * Updates or creates a status bar item for a given workspace folder with the specified build status.
 * @param workspaceFolder The VS Code workspace folder.
 * @param status The Jenkins build status (e.g., "SUCCESS", "FAILURE", "ABORTED", null, or undefined).
 * @param command An optional command to execute when the status bar item is clicked.
 */
export function updateStatusBar(workspaceFolder: vscode.WorkspaceFolder, status: string | undefined, command?: string) {
  const folderName = workspaceFolder.name;
  let statusBar = statusBars.get(folderName);

  if (!statusBar) {
    // Create a new status bar item if it doesn't exist
    statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBars.set(folderName, statusBar);
    statusBar.show();
  }

  // Update the status bar item based on the build status
  let text = `$(sync~spin) ${folderName}: Checking...`; // Default text
  let color = undefined;
  let tooltip = `Jenkins build status for ${folderName}`;

  if (status === 'SUCCESS') {
    text = `$(check) ${folderName}: Success`;
    color = 'green';
  } else if (status === 'FAILURE') {
    text = `$(error) ${folderName}: Failed`;
    color = 'red';
  } else if (status === 'ABORTED') {
    text = `$(circle-slash) ${folderName}: Aborted`;
    color = 'yellow';
  } else if (status === null) { // Jenkins API returns null for building
     text = `$(sync~spin) ${folderName}: Building...`;
     color = 'yellow'; // Or blue
  } else if (status === undefined) {
    text = `$(question) ${folderName}: Unknown`;
    color = undefined; // Default color
    tooltip = `Jenkins build status for ${folderName}: Could not retrieve status. Check configuration and Jenkins server.`;
  }

  statusBar.text = text;
  statusBar.color = color;
  statusBar.tooltip = tooltip;
  statusBar.command = command; // Set the command
}

/**
 * Disposes of all active status bar items.
 */
export function disposeStatusBars() {
  statusBars.forEach(statusBar => statusBar.dispose());
  statusBars.clear();
}

/**
 * Adds all current status bar items to a list of subscriptions.
 * This is typically used during extension activation to ensure items are disposed on deactivation.
 * @param subscriptions The list of subscriptions from the extension context.
 */
export function addStatusBarsToSubscriptions(subscriptions: vscode.Disposable[]) {
    statusBars.forEach(statusBar => subscriptions.push(statusBar));
}