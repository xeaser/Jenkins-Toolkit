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