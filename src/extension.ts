import * as vscode from 'vscode';
import { getConfiguration, getJenkinsApiToken, getJenkinsJobName, setJenkinsApiToken } from './configuration';
import { fetchBuildStatus } from './jenkinsApi';
import { disposeStatusBars, updateStatusBar } from './statusBar';
import { JenkinsTreeDataProvider } from './treeView'; // Import the TreeDataProvider

// Global variables
let pollingInterval: NodeJS.Timeout | undefined;
let jenkinsTreeDataProvider: JenkinsTreeDataProvider; // Tree View Data Provider instance

/**
 * Refreshes the build statuses for all open workspace folders and updates the UI.
 * @param secretStorage The SecretStorage instance from the extension context.
 */
async function refreshBuildStatuses(secretStorage: vscode.SecretStorage) {
  const config = getConfiguration();
  const jenkinsUrl = config.jenkinsUrl;
  const username = config.username;
  const apiToken = await getJenkinsApiToken(secretStorage);
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!jenkinsUrl || !username) {
    // Prompt user to configure if settings are missing
    if (workspaceFolders) {
         workspaceFolders.forEach(folder => {
             updateStatusBar(folder, undefined, 'jenkinsBuildStatus.configure'); // Indicate unknown status and provide configure command
         });
    }
     // Also update the tree view to show the configuration message
     jenkinsTreeDataProvider.clearCache(); // Clear cache to force re-fetch on next view open
     jenkinsTreeDataProvider.refresh();
    return;
  }

  if (!apiToken) {
    vscode.window.showWarningMessage('Jenkins API Token not provided.');
    return;
  }

  if (workspaceFolders) {
    for (const folder of workspaceFolders) {
      const jobName = getJenkinsJobName(folder, config.repositoryMappings);
      if (jobName) {
        const status = await fetchBuildStatus(jenkinsUrl, jobName, username, apiToken);
        updateStatusBar(folder, status);
      } else {
        // Handle case where no mapping is found for a workspace folder
        updateStatusBar(folder, undefined, 'jenkinsBuildStatus.configure'); // Indicate no mapping and provide configure command
      }
    }
  }

  // Refresh the tree view
  jenkinsTreeDataProvider.clearCache(); // Clear cache to ensure fresh data
  jenkinsTreeDataProvider.refresh();

  // Note: Removing status bars for closed folders is handled implicitly by updateStatusBar
  // when workspaceFolders changes, as updateStatusBar is only called for current folders.
  // However, explicit disposal on deactivation is still needed.
}

/**
 * Prompts the user for their Jenkins API token and stores it securely.
 * @param secretStorage The SecretStorage instance from the extension context.
 */
async function promptForApiToken(secretStorage: vscode.SecretStorage) {
    const apiToken = await vscode.window.showInputBox({
        prompt: 'Enter your Jenkins API Token',
        ignoreFocusOut: true, // Keep the input box open
        password: true // Mask the input
    });

    if (apiToken) {
        await setJenkinsApiToken(secretStorage, apiToken);
        // After setting the token, refresh statuses and tree view
        refreshBuildStatuses(secretStorage);
    } else {
        vscode.window.showWarningMessage('Jenkins API Token not provided.');
    }
}

/**
 * Opens a URL in the default web browser.
 * @param url The URL to open.
 */
function openUrlInBrowser(url: string) {
    vscode.env.openExternal(vscode.Uri.parse(url));
}

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
  console.log('Jenkins Build Status extension activated.');

  // Initialize the Tree Data Provider
  // Cast context to any to access secretStorage for the constructor
  jenkinsTreeDataProvider = new JenkinsTreeDataProvider(context.secrets);

  // Register the Tree View
  context.subscriptions.push(
      vscode.window.registerTreeDataProvider('jenkinsBuildStatusView', jenkinsTreeDataProvider)
  );


  // Register commands
  context.subscriptions.push(
      vscode.commands.registerCommand('jenkinsBuildStatus.configure', () => {
          vscode.commands.executeCommand('workbench.action.openSettings', 'jenkinsBuildStatus');
      }),
      vscode.commands.registerCommand('jenkinsBuildStatus.setApiToken', () => {
          // Cast context to any to access secretStorage
          promptForApiToken(context.secrets);
      }),
      vscode.commands.registerCommand('jenkinsBuildStatus.refreshTreeView', () => {
          // Refresh the tree view manually
          jenkinsTreeDataProvider.clearCache(); // Clear cache on manual refresh
          jenkinsTreeDataProvider.refresh();
      }),
      vscode.commands.registerCommand('jenkinsBuildStatus.openBuildInBrowser', (url: string) => {
          openUrlInBrowser(url);
      })
  );


  // Initial refresh of status bars and tree view
  // Cast context to any to access secretStorage
  refreshBuildStatuses(context.secrets);

  // Set up polling
  const config = getConfiguration();
  // Pass context.secretStorage to the interval function
   // Cast context to any to access secretStorage within the interval callback
  pollingInterval = setInterval(() => refreshBuildStatuses(context.secrets), config.pollingInterval);

  // Listen for configuration changes to update polling interval and refresh statuses
  context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(event => {
          if (event.affectsConfiguration('jenkinsBuildStatus.pollingInterval')) {
              clearInterval(pollingInterval);
              const newPollingInterval = getConfiguration().pollingInterval;
               // Pass context.secretStorage to the new interval function
                // Cast context to any to access secretStorage within the interval callback
              pollingInterval = setInterval(() => refreshBuildStatuses(context.secrets), newPollingInterval);
          }
          if (event.affectsConfiguration('jenkinsBuildStatus.jenkinsUrl') ||
              event.affectsConfiguration('jenkinsBuildStatus.username') ||
              event.affectsConfiguration('jenkinsBuildStatus.repositoryMappings')) {
               // Re-fetch and update status and tree view if relevant configuration changes
                // Cast context to any to access secretStorage
                refreshBuildStatuses(context.secrets);
          }
      })
  );


  // Listen for workspace folder changes
  context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
          // Use stored context, cast to any to access secretStorage
          refreshBuildStatuses(context.secrets);
      })
  );


  // Add status bars to subscriptions so they are disposed on deactivation
  // This needs to be done after status bars are potentially created during initial refresh
  // A better approach might be to manage subscriptions within the statusBar module
  // or refresh statuses in a way that disposes of old items and creates new ones.
  // For simplicity here, we'll rely on disposeStatusBars in deactivate.
}

// This method is called when your extension is deactivated
export function deactivate() {
  console.log('Jenkins Build Status extension deactivated.');
  // Clear the polling interval
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }
  // Dispose of all status bar items
  disposeStatusBars();
}