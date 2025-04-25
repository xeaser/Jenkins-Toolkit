import { JenkinsBuild } from './types';

/**
 * Fetches the last build status for a given Jenkins job.
 * @param jenkinsUrl The URL of the Jenkins server.
 * @param jobName The name of the Jenkins job.
 * @param username The Jenkins username for authentication.
 * @param apiToken The Jenkins API token for authentication.
 * @returns The build status (e.g., "SUCCESS", "FAILURE", "ABORTED", null for building) or undefined if the request fails.
 */
export async function fetchBuildStatus(jenkinsUrl: string, jobName: string, username: string, apiToken: string): Promise<string | undefined> {
  const url = `${jenkinsUrl}/job/${jobName}/lastBuild/api/json`;
  console.log(`Attempting to fetch build status from: ${url}`); // Log the URL

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${username}:${apiToken}`).toString('base64')
      }
    });

    console.log(`Received response status: ${response.status}`); // Log the response status

    if (!response.ok) {
      console.error(`Jenkins API request failed for ${jobName}: ${response.statusText} (${response.status})`); // More detailed error logging
      return undefined;
    }

    const data = await response.json() as any; // Use 'any' for simplicity, consider a more specific type
    console.log(`Successfully fetched data for ${jobName}. Result: ${data.result}`); // Log successful fetch
    return data.result; // e.g., "SUCCESS", "FAILURE", "ABORTED", null (for building)

  } catch (error: any) {
    console.error(`Error fetching Jenkins build status for ${jobName}: ${error.message}`); // Log fetch errors
    return undefined;
  }
}

/**
 * Fetches recent build history for a given Jenkins job.
 * @param jenkinsUrl The URL of the Jenkins server.
 * @param jobName The name of the Jenkins job.
 * @param username The Jenkins username for authentication.
 * @param apiToken The Jenkins API token for authentication.
 * @param count The number of recent builds to fetch.
 * @returns An array of JenkinsBuild objects or undefined if the request fails.
 */
export async function fetchBuildHistory(jenkinsUrl: string, jobName: string, username: string, apiToken: string, count: number = 10): Promise<JenkinsBuild[] | undefined> {
  // Using the /api/json endpoint with tree parameter to get limited build info, including change sets with author email
  const url = `${jenkinsUrl}/job/${jobName}/api/json?tree=builds[number,url,result,timestamp,duration,changeSets[items[msg,authorEmail,commitId]]]`; // Updated tree parameter
  console.log(`Attempting to fetch build history from: ${url}`);

  try {
      const response = await fetch(url, {
          headers: {
              'Authorization': 'Basic ' + Buffer.from(`${username}:${apiToken}`).toString('base64')
          }
      });

      console.log(`Received build history response status: ${response.status}`);

      if (!response.ok) {
          console.error(`Jenkins API request failed for build history of ${jobName}: ${response.statusText} (${response.status})`);
          return undefined;
      }

      const data = await response.json() as any;
      console.log(`Successfully fetched build history for ${jobName}. Found ${data.builds ? data.builds.length : 0} builds.`);
      return data.builds as JenkinsBuild[] | undefined;

  } catch (error: any) {
      console.error(`Error fetching Jenkins build history for ${jobName}: ${error.message}`);
      return undefined;
  }
}