import * as vscode from 'vscode';
const fetch = require("node-fetch");

// Define interfaces for configuration
interface RepositoryMapping {
  workspaceFolderName: string;
  jenkinsJobName: string;
}

interface JenkinsConfiguration {
  jenkinsUrl: string;
  username: string;
  repositoryMappings: RepositoryMapping[];
  pollingInterval: number;
}

// Global variables
let statusBars: Map<string, vscode.StatusBarItem> = new Map();
let pollingInterval: NodeJS.Timeout | undefined;
let extensionContext: vscode.ExtensionContext; // Store context globally or pass it

// Function to get configuration
function getConfiguration(): JenkinsConfiguration {
  const config = vscode.workspace.getConfiguration('jenkinsBuildStatus');
  return {
    jenkinsUrl: config.get<string>('jenkinsUrl', ''),
    username: config.get<string>('username', ''),
    repositoryMappings: config.get<RepositoryMapping[]>('repositoryMappings', []),
    pollingInterval: config.get<number>('pollingInterval', 30000)
  };
}

// Function to get Jenkins API token securely
// Accept SecretStorage as a parameter
async function getJenkinsApiToken(secretStorage: vscode.SecretStorage): Promise<string | undefined> {
  const username = getConfiguration().username;
  if (!username) {
    return undefined;
  }
  // Use SecretStorage to securely store and retrieve the API token
  return await secretStorage.get(`jenkinsApiToken.${username}`);
}

// Function to set Jenkins API token securely
// Accept SecretStorage as a parameter
async function setJenkinsApiToken(secretStorage: vscode.SecretStorage, token: string): Promise<void> {
  const username = getConfiguration().username;
  if (username) {
    await secretStorage.store(`jenkinsApiToken.${username}`, token);
    vscode.window.showInformationMessage('Jenkins API Token stored securely.');
  } else {
    vscode.window.showWarningMessage('Please configure Jenkins username before setting API token.');
  }
}

// Function to get the Jenkins job name for a given workspace folder
function getJenkinsJobName(workspaceFolder: vscode.WorkspaceFolder, mappings: RepositoryMapping[]): string | undefined {
  const mapping = mappings.find(m => m.workspaceFolderName === workspaceFolder.name);
  return mapping?.jenkinsJobName;
}

// Function to fetch build status from Jenkins
async function fetchBuildStatus(jenkinsUrl: string, jobName: string, username: string, apiToken: string): Promise<string | undefined> {
  const url = `${jenkinsUrl}/job/${jobName}/lastBuild/api/json`;
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${username}:${apiToken}`).toString('base64')
      }
    });

    if (!response.ok) {
      // Handle non-200 responses, e.g., job not found, authentication failure
      console.error(`Jenkins API request failed: ${response.statusText}`);
      return undefined;
    }

    const data = await response.json() as any; // Use 'any' for simplicity, consider a more specific type
    return data.result; // e.g., "SUCCESS", "FAILURE", "ABORTED", null (for building)

  } catch (error: any) {
    console.error(`Error fetching Jenkins build status for ${jobName}: ${error.message}`);
    return undefined;
  }
}

// Function to update the status bar item
function updateStatusBar(workspaceFolder: vscode.WorkspaceFolder, status: string | undefined) {
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
}

// Function to refresh build statuses for all workspace folders
async function refreshBuildStatuses(secretStorage: vscode.SecretStorage) {
  const config = getConfiguration();
  const jenkinsUrl = config.jenkinsUrl;
  const username = config.username;
  const apiToken = await getJenkinsApiToken(secretStorage); // Pass secretStorage
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!jenkinsUrl || !username || !apiToken) {
    // Prompt user to configure if settings are missing
    if (statusBars.size === 0 && workspaceFolders) {
         workspaceFolders.forEach(folder => {
             const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
             statusBar.text = `$(alert) Configure Jenkins`;
             statusBar.tooltip = 'Click to configure Jenkins URL, username, and API token.';
             statusBar.command = 'jenkinsBuildStatus.configure'; // Command to open settings
             statusBar.show();
             statusBars.set(folder.name, statusBar);
         });
    } else {
        statusBars.forEach(statusBar => {
            statusBar.text = `$(alert) Configure Jenkins`;
            statusBar.tooltip = 'Click to configure Jenkins URL, username, and API token.';
            statusBar.command = 'jenkinsBuildStatus.configure'; // Command to open settings
        });
    }
    return;
  } else {
       // Ensure status bars are created if they don't exist after configuration is available
       if (statusBars.size === 0 && workspaceFolders) {
            workspaceFolders.forEach(folder => {
                const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
                statusBar.show();
                statusBars.set(folder.name, statusBar);
            });
       }
  }


  if (workspaceFolders) {
    for (const folder of workspaceFolders) {
      const jobName = getJenkinsJobName(folder, config.repositoryMappings);
      if (jobName) {
        const status = await fetchBuildStatus(jenkinsUrl, jobName, username, apiToken);
        updateStatusBar(folder, status);
      } else {
        // Handle case where no mapping is found for a workspace folder
        updateStatusBar(folder, undefined); // Indicate unknown status, maybe a different icon/text
        const statusBar = statusBars.get(folder.name);
        if(statusBar) {
             statusBar.tooltip = `No Jenkins job mapping found for workspace folder "${folder.name}". Configure in extension settings.`;
             statusBar.text = `$(question) ${folder.name}: No mapping`;
             statusBar.color = undefined;
             statusBar.command = 'jenkinsBuildStatus.configure'; // Command to open settings
        }
      }
    }
  }

  // Remove status bars for folders that are no longer open
  statusBars.forEach((statusBar, folderName) => {
      if (!workspaceFolders || !workspaceFolders.find(folder => folder.name === folderName)) {
          statusBar.dispose();
          statusBars.delete(folderName);
      }
  });
}

// Function to prompt user for Jenkins API token and store it securely
// Accept SecretStorage as a parameter
async function promptForApiToken(secretStorage: vscode.SecretStorage) {
    const apiToken = await vscode.window.showInputBox({
        prompt: 'Enter your Jenkins API Token',
        ignoreFocusOut: true, // Keep the input box open
        password: true // Mask the input
    });

    if (apiToken) {
        await setJenkinsApiToken(secretStorage, apiToken); // Pass secretStorage
    } else {
        vscode.window.showWarningMessage('Jenkins API Token not provided.');
    }
}


// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
  console.log('Jenkins Build Status extension activated!');

  // Store the context
  extensionContext = context;

  // Register a command to configure the extension (opens settings)
  let configureCommand = vscode.commands.registerCommand('jenkinsBuildStatus.configure', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'jenkinsBuildStatus');
  });
  context.subscriptions.push(configureCommand);

   // Register a command to set the Jenkins API token
  let setApiTokenCommand = vscode.commands.registerCommand('jenkinsBuildStatus.setApiToken', () => {
      // Cast context to any to access secretStorage
      promptForApiToken((context as any).secretStorage); // Pass context.secretStorage
  });
  context.subscriptions.push(setApiTokenCommand);


  // Initial refresh
  // Cast context to any to access secretStorage
  refreshBuildStatuses((context as any).secretStorage); // Pass context.secretStorage

  // Set up polling
  const config = getConfiguration();
  // Pass context.secretStorage to the interval function
   // Cast context to any to access secretStorage within the interval callback
  pollingInterval = setInterval(() => refreshBuildStatuses((extensionContext as any).secretStorage), config.pollingInterval);

  // Listen for configuration changes to update polling interval
  vscode.workspace.onDidChangeConfiguration(event => {
      // Fix: Use affectsConfiguration instead of intersects
      if (event.affectsConfiguration('jenkinsBuildStatus.pollingInterval')) {
          clearInterval(pollingInterval);
          const newPollingInterval = getConfiguration().pollingInterval;
           // Pass context.secretStorage to the new interval function
            // Cast context to any to access secretStorage within the interval callback
          pollingInterval = setInterval(() => refreshBuildStatuses((extensionContext as any).secretStorage), newPollingInterval);
      }
      // Fix: Use affectsConfiguration instead of intersects
      if (event.affectsConfiguration('jenkinsBuildStatus.jenkinsUrl') ||
          event.affectsConfiguration('jenkinsBuildStatus.username') ||
          event.affectsConfiguration('jenkinsBuildStatus.repositoryMappings')) {
           // Re-fetch and update status if relevant configuration changes
            // Cast context to any to access secretStorage
            refreshBuildStatuses((extensionContext as any).secretStorage); // Pass context.secretStorage
      }
  });

  // Listen for workspace folder changes
  vscode.workspace.onDidChangeWorkspaceFolders(() => {
      // Use stored context, cast to any to access secretStorage
      refreshBuildStatuses((extensionContext as any).secretStorage); // Use stored context
  });

  // Add status bars to subscriptions so they are disposed on deactivation
  statusBars.forEach(statusBar => context.subscriptions.push(statusBar));
}

// This method is called when your extension is deactivated
export function deactivate() {
  console.log('Jenkins Build Status extension deactivated.');
  // Clear the polling interval
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }
  // Dispose of all status bar items
  statusBars.forEach(statusBar => statusBar.dispose());
  statusBars.clear();
}
