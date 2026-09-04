import * as core from "@actions/core";
import { HttpClient } from "@actions/http-client";

import { run } from "../src/main";

/**
 * Builds a stub of the plain-text response returned by checkip.amazonaws.com.
 */
const textResponse = (body: string, statusCode = 200) => ({
  message: { statusCode },
  readBody: jest.fn().mockResolvedValue(body)
});

describe("Public IP", () => {
  beforeAll(() => {
    jest.mock("@actions/http-client");
    jest.spyOn(core, "info");
    jest.spyOn(core, "getInput").mockReturnValue("6");
    jest.spyOn(core, "setFailed");
    jest.spyOn(core, "setOutput");
    jest.spyOn(core, "warning");
  });

  beforeEach(() => jest.clearAllMocks());

  afterAll(() => jest.resetAllMocks());

  test("Return public ip address", async () => {
    HttpClient.prototype.get = jest
      .fn()
      .mockResolvedValue(textResponse("1.2.3.4\n"));
    HttpClient.prototype.getJson = jest
      .fn()
      .mockResolvedValue({ statusCode: 200, result: { ip: "::1" } });

    await expect(run()).resolves.toBe(undefined);

    expect(HttpClient.prototype.get).toHaveBeenCalled();
    expect(core.getInput).toHaveBeenCalledWith("maxRetries");
    expect(core.getInput).toHaveReturnedWith("6");
    expect(core.setOutput).toHaveBeenCalledTimes(2);
    expect(core.setOutput).toHaveBeenCalledWith("ipv4", "1.2.3.4");
    expect(core.setOutput).toHaveBeenCalledWith("ipv6", "::1");
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  test("Fall back to ipify when the primary endpoint fails", async () => {
    HttpClient.prototype.get = jest
      .fn()
      .mockRejectedValue(new Error("ECONNRESET"));
    HttpClient.prototype.getJson = jest
      .fn()
      .mockResolvedValue({ statusCode: 200, result: { ip: "5.6.7.8" } });

    await expect(run()).resolves.toBe(undefined);

    expect(core.warning).toHaveBeenCalled();
    expect(core.setOutput).toHaveBeenCalledWith("ipv4", "5.6.7.8");
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  test("Treat a non-200 from the primary endpoint as a failure", async () => {
    HttpClient.prototype.get = jest
      .fn()
      .mockResolvedValue(textResponse("", 503));
    HttpClient.prototype.getJson = jest
      .fn()
      .mockResolvedValue({ statusCode: 200, result: { ip: "5.6.7.8" } });

    await expect(run()).resolves.toBe(undefined);

    expect(core.setOutput).toHaveBeenCalledWith("ipv4", "5.6.7.8");
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  test("Fail when neither ipv4 source responds", async () => {
    HttpClient.prototype.get = jest
      .fn()
      .mockRejectedValue(new Error("ECONNRESET"));
    HttpClient.prototype.getJson = jest
      .fn()
      .mockRejectedValue({ statusCode: 500, result: null });

    await expect(run()).resolves.toBe(undefined);

    expect(core.setFailed).toHaveBeenCalled();
    expect(core.setOutput).not.toHaveBeenCalledWith("ipv4", expect.anything());
  });

  test("An ipv6 failure does not fail the action", async () => {
    HttpClient.prototype.get = jest
      .fn()
      .mockResolvedValue(textResponse("1.2.3.4\n"));
    HttpClient.prototype.getJson = jest
      .fn()
      .mockRejectedValue({ statusCode: 500, result: null });

    await expect(run()).resolves.toBe(undefined);

    expect(core.setOutput).toHaveBeenCalledWith("ipv4", "1.2.3.4");
    expect(core.setOutput).toHaveBeenCalledWith("ipv6", "");
    expect(core.setFailed).not.toHaveBeenCalled();
  });
});
