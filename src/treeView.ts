import * as vscode from 'vscode';
import { getConfiguration, getJenkinsApiToken, getJenkinsJobName } from './configuration';
import { fetchBuildHistory } from './jenkinsApi';
import { JenkinsBuild, JenkinsBuildItem, JenkinsJobItem, JenkinsTreeItem } from './types';

/**
 * Provides data for the Jenkins Build Status Tree View.
 */
export class JenkinsTreeDataProvider implements vscode.TreeDataProvider<JenkinsTreeItem | vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<JenkinsTreeItem | vscode.TreeItem | undefined | void> = new vscode.EventEmitter<JenkinsTreeItem | vscode.TreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<JenkinsTreeItem | vscode.TreeItem | undefined | void> = this._onDidChangeTreeData.event;

    private secretStorage: vscode.SecretStorage;
    private jobs: Map<string, JenkinsBuild[]> = new Map(); // Cache for job builds

    constructor(secretStorage: vscode.SecretStorage) {
        this.secretStorage = secretStorage;
    }

    /**
     * Refreshes the Tree View.
     */
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    /**
     * Gets the tree item for an element.
     * @param element The element for which to get the tree item.
     * @returns The tree item.
     */
    getTreeItem(element: JenkinsTreeItem | vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * Gets the children of an element.
     * @param element The element for which to get the children.
     * @returns The children of the element.
     */
    async getChildren(element?: JenkinsTreeItem | vscode.TreeItem): Promise<(JenkinsTreeItem | vscode.TreeItem)[]> {
        const config = getConfiguration();
        const jenkinsUrl = config.jenkinsUrl;
        const username = config.username;
        const apiToken = await getJenkinsApiToken(this.secretStorage);
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const configuredUsername = config.username.toLowerCase();

        if (!jenkinsUrl || !username) {
            // Show a message in the tree view if configuration is missing
            return [new vscode.TreeItem('Please configure Jenkins settings', vscode.TreeItemCollapsibleState.None)];
        }

        if (!apiToken) {
            // Show a message in the tree view if API Token is missing
            return [new vscode.TreeItem('Please configure Jenkins API Token', vscode.TreeItemCollapsibleState.None)];
        }

        if (!element) {
            // Top level elements are workspace folders mapped to Jenkins jobs
            const jobItems: (JenkinsJobItem | vscode.TreeItem)[] = []; // Allow both types
            if (workspaceFolders) {
                for (const folder of workspaceFolders) {
                    const jobName = getJenkinsJobName(folder, config.repositoryMappings);
                    if (jobName) {
                        // For the top level, we just show the job name. Builds are children.
                        const jobItem = new JenkinsJobItem(folder.name, jobName, vscode.TreeItemCollapsibleState.Collapsed, []);
                        jobItems.push(jobItem);
                    } else {
                        // Indicate workspace folder with no Jenkins job mapping
                         const noMappingItem = new vscode.TreeItem(`${folder.name} (No Jenkins job mapping)`, vscode.TreeItemCollapsibleState.None);
                         noMappingItem.tooltip = 'Configure Jenkins job mapping in extension settings.';
                         noMappingItem.command = { command: 'jenkinsBuildStatus.configure', title: 'Configure Settings' };
                         jobItems.push(noMappingItem);
                    }
                }
            }
             if (jobItems.length === 0) {
                 return [new vscode.TreeItem('No workspace folders with Jenkins job mappings found.', vscode.TreeItemCollapsibleState.None)];
             }
            return jobItems;

        } else if (element instanceof JenkinsJobItem) {
            // Children of a Jenkins job item are its builds
            const jobName = element.jobName;
            let builds = this.jobs.get(jobName); // Check cache first

            if (!builds) {
                // Fetch builds if not in cache
                builds = await fetchBuildHistory(jenkinsUrl, jobName, username, apiToken);
                if (builds) {
                    this.jobs.set(jobName, builds); // Cache the builds
                } else {
                    return [new vscode.TreeItem('Could not fetch builds.', vscode.TreeItemCollapsibleState.None)];
                }
            }

            if (builds && builds.length > 0) {
                // Filter builds by configured username if available, checking authorEmail in changeSets
                const filteredBuilds = configuredUsername
                    ? builds.filter(build => {
                        // console.log(`Build #${build.number} changeSets:`, build.changeSets); // Log changeSets for debugging
                        return build.changeSets?.some(changeSet =>
                            changeSet.items?.some(item => {
                                // console.log(`Build #${build.number} changeSet item authorEmail:`, item.authorEmail); // Log authorEmail for debugging
                                return item.authorEmail && item.authorEmail.toLowerCase() === configuredUsername;
                            })
                        );
                    })
                    : builds; // If no username configured, show all builds

                if (filteredBuilds.length > 0) {
                    // Sort builds by number in descending order
                    filteredBuilds.sort((a, b) => b.number - a.number);
                    return filteredBuilds.map(build => new JenkinsBuildItem(`${build.changeSets[0].items[0].commitId}`, `${build.changeSets[0].items[0].msg}`,build, vscode.TreeItemCollapsibleState.None, jobName));
                } else {
                    vscode.window.showWarningMessage(`No builds for configured user ${configuredUsername}, showing last ${builds.length} builds`);
                    return builds.map(build => new JenkinsBuildItem(`${build.changeSets[0].items[0].commitId}`, `${build.changeSets[0].items[0].msg}`, build, vscode.TreeItemCollapsibleState.None, jobName));
                }
            } else {
                return [new vscode.TreeItem('No builds found.', vscode.TreeItemCollapsibleState.None)];
            }
        }

        return []; // No children for build items or unknown elements
    }

    /**
     * Clears the build cache.
     */
    clearCache(): void {
        this.jobs.clear();
    }
}