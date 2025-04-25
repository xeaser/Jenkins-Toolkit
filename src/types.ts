import * as vscode from 'vscode';

// Define interfaces for configuration
export interface RepositoryMapping {
  workspaceFolderName: string;
  jenkinsJobName: string;
}

export interface JenkinsConfiguration {
  jenkinsUrl: string;
  username: string;
  repositoryMappings: RepositoryMapping[];
  pollingInterval: number;
}

// Interface for a Jenkins build
export interface JenkinsBuild {
  number: number;
  url: string;
  result: string | null; // "SUCCESS", "FAILURE", "ABORTED", null (for building)
  timestamp: number; // Build start time in milliseconds
  duration: number; // Build duration in milliseconds
}

// Tree View Item types
export type JenkinsTreeItem = JenkinsJobItem | JenkinsBuildItem;

// Represents a Jenkins job in the Tree View
export class JenkinsJobItem extends vscode.TreeItem {
  constructor(
    public readonly label: string, // Job name
    public readonly jobName: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly builds: JenkinsBuild[] // List of recent builds
  ) {
    super(label, collapsibleState);
    this.tooltip = this.label;
    this.iconPath = new vscode.ThemeIcon('symbol-folder'); // Default folder icon
  }
}

// Represents a Jenkins build in the Tree View
export class JenkinsBuildItem extends vscode.TreeItem {
  constructor(
    public readonly label: string, // Build display (e.g., #123 - SUCCESS)
    public readonly build: JenkinsBuild,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly jobName: string // Parent job name
  ) {
    super(label, collapsibleState);
    this.tooltip = `#${build.number} - ${build.result || 'BUILDING'}\nDuration: ${formatDuration(build.duration)}\nStart Time: ${formatTimestamp(build.timestamp)}`;
    this.description = `#${build.number} - ${build.result || 'BUILDING'}`;

    // Set icon based on build result
    this.iconPath = getStatusIcon(build.result);

    // Add a command to open the build URL
    this.command = {
      command: 'jenkinsBuildStatus.openBuildInBrowser',
      title: 'Open Build in Browser',
      arguments: [build.url]
    };
  }
}

/**
 * Gets the appropriate VS Code ThemeIcon for a given Jenkins build status.
 * @param status The Jenkins build status.
 * @returns A ThemeIcon instance.
 */
function getStatusIcon(status: string | null): vscode.ThemeIcon {
  switch (status) {
    case 'SUCCESS':
      return new vscode.ThemeIcon('status-success', new vscode.ThemeColor('testing.iconPassed'));
    case 'FAILURE':
      return new vscode.ThemeIcon('status-failure', new vscode.ThemeColor('testing.iconFailed'));
    case 'ABORTED':
      return new vscode.ThemeIcon('status-aborted', new vscode.ThemeColor('testing.iconSkipped'));
    case null: // Building
      return new vscode.ThemeIcon('status-building', new vscode.ThemeColor('testing.iconQueued'));
    default:
      return new vscode.ThemeIcon('status-unknown');
  }
}

/**
 * Formats a duration in milliseconds into a human-readable string.
 * @param durationMs The duration in milliseconds.
 * @returns A formatted duration string.
 */
function formatDuration(durationMs: number): string {
    if (durationMs === 0) {
        return 'N/A';
    }
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes > 0) {
        return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
}

/**
 * Formats a timestamp in milliseconds into a human-readable date and time string.
 * @param timestampMs The timestamp in milliseconds.
 * @returns A formatted date and time string.
 */
function formatTimestamp(timestampMs: number): string {
    if (timestampMs === 0) {
        return 'N/A';
    }
    const date = new Date(timestampMs);
    return date.toLocaleString();
}