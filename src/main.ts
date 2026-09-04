import * as core from "@actions/core";
import { HttpClient } from "@actions/http-client";

/**
 * AWS's plain-text echo endpoint. Primary source for the IPv4 address:
 * consumers of this action use the result to open a security group, so the
 * lookup should not depend on a third-party service that rate-limits the
 * shared egress IPs of GitHub-hosted runners.
 */
const IPV4_PRIMARY = "https://checkip.amazonaws.com";

/**
 * IPify, kept as a fallback for the IPv4 lookup.
 *
 * @see https://www.ipify.org/
 */
const IPV4_FALLBACK = "https://api.ipify.org?format=json";

/**
 * IPify's dual-stack endpoint. Returns an IPv6 address where one is
 * available and the IPv4 address otherwise.
 */
const IPV6_URL = "https://api64.ipify.org?format=json";

/**
 * Queries the runner's public IPv4 address, preferring AWS's echo endpoint
 * and falling back to IPify.
 */
async function resolveIpv4(http: HttpClient): Promise<string> {
  try {
    const response = await http.get(IPV4_PRIMARY);
    const body = (await response.readBody()).trim();

    if (response.message.statusCode !== 200) {
      throw new Error(`responded ${response.message.statusCode}`);
    }
    if (!body) {
      throw new Error("responded with an empty body");
    }

    return body;
  } catch (error) {
    core.warning(
      `${IPV4_PRIMARY} lookup failed (${error?.message}); falling back to ${IPV4_FALLBACK}`
    );

    const response = await http.getJson<IPResponse>(IPV4_FALLBACK);

    return response.result.ip;
  }
}

/**
 * Action bootstrapper.
 *
 * @export
 */
export async function run(): Promise<void> {
  const maxRetries = parseInt(core.getInput("maxRetries"), 10);
  const http = new HttpClient("simplefractal/public-ip", undefined, {
    allowRetries: true,
    maxRetries: maxRetries
  });

  let ipv4: string;

  try {
    ipv4 = await resolveIpv4(http);
  } catch (error) {
    core.setFailed(
      `could not determine the runner's public IPv4 address: ${error?.message}`
    );

    return;
  }

  core.setOutput("ipv4", ipv4);
  core.info(`ipv4: ${ipv4}`);

  // The IPv6 lookup is best-effort. A v4-only runner must not fail a deploy
  // over an address the caller may not use, so the output is still set (to an
  // empty string) to keep the action's shape stable for consumers.
  try {
    const response = await http.getJson<IPResponse>(IPV6_URL);

    core.setOutput("ipv6", response.result.ip);
    core.info(`ipv6: ${response.result.ip}`);
  } catch (error) {
    core.setOutput("ipv6", "");
    core.warning(
      `${IPV6_URL} lookup failed (${error?.message}); the ipv6 output is empty`
    );
  }
}

/**
 * IPify Response.
 *
 * @see https://www.ipify.org/
 */
interface IPResponse {
  ip: string;
}

run();
