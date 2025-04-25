import * as vscode from 'vscode';
import { getConfiguration, getJenkinsApiToken, getJenkinsJobName, setJenkinsApiToken } from './configuration';
import { fetchBuildStatus } from './jenkinsApi';
import { disposeStatusBars, updateStatusBar } from './statusBar';

// Global variables
let pollingInterval: NodeJS.Timeout | undefined;

/**
 * Refreshes the build statuses for all open workspace folders.
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
    return;
  }

  if (!apiToken) {
    vscode.window.showWarningMessage('Please configure Jenkins API token.');
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
        // After setting the token, refresh statuses
        refreshBuildStatuses(secretStorage);
    } else {
        vscode.window.showWarningMessage('Jenkins API Token not provided.');
    }
}


// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
  console.log('Jenkins Build Status extension activated.');

  // Register commands
  context.subscriptions.push(
      vscode.commands.registerCommand('jenkinsBuildStatus.configure', () => {
          vscode.commands.executeCommand('workbench.action.openSettings', 'jenkinsBuildStatus');
      }),
      vscode.commands.registerCommand('jenkinsBuildStatus.setApiToken', () => {
          promptForApiToken(context.secrets);
      })
  );

  // Initial refresh
  refreshBuildStatuses(context.secrets);

  // Set up polling
  const config = getConfiguration();
  // Pass context.secretStorage to the interval function
  pollingInterval = setInterval(() => refreshBuildStatuses(context.secrets), config.pollingInterval);

  // Listen for configuration changes to update polling interval and refresh statuses
  context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(event => {
          if (event.affectsConfiguration('jenkinsBuildStatus.pollingInterval')) {
              clearInterval(pollingInterval);
              const newPollingInterval = getConfiguration().pollingInterval;
               // Pass context.secretStorage to the new interval function
              pollingInterval = setInterval(() => refreshBuildStatuses(context.secrets), newPollingInterval);
          }
          if (event.affectsConfiguration('jenkinsBuildStatus.jenkinsUrl') ||
              event.affectsConfiguration('jenkinsBuildStatus.username') ||
              event.affectsConfiguration('jenkinsBuildStatus.repositoryMappings')) {
               // Re-fetch and update status if relevant configuration changes
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