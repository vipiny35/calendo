import { describe, expect, it } from "vitest";
import { meetingBrand } from "../src/shared/meetings";

describe("meeting links", () => {
  it("names the services it knows", () => {
    expect(meetingBrand("https://meet.google.com/abc-defg-hij").brand).toBe("meet");
    expect(meetingBrand("https://acme.zoom.us/j/123").brand).toBe("zoom");
    expect(meetingBrand("https://company.zoom.com/j/123").brand).toBe("zoom");
    expect(meetingBrand("https://facetime.apple.com/join#v=1,p=x").brand).toBe("facetime");
    expect(meetingBrand("https://teams.microsoft.com/l/meetup-join/x").brand).toBe("teams");
    expect(meetingBrand("https://acme.webex.com/meet/x").brand).toBe("webex");
  });

  it("labels each one for the menu", () => {
    expect(meetingBrand("https://meet.google.com/x").label).toBe("Join Google Meet meeting");
    expect(meetingBrand("https://facetime.apple.com/x").label).toBe("Join FaceTime call");
  });

  it("falls back rather than trusting a lookalike host", () => {
    expect(meetingBrand("https://notzoom.us/j/1").brand).toBe("generic");
    expect(meetingBrand("https://zoom.us.example.com/j/1").brand).toBe("generic");
    expect(meetingBrand("https://example.com/call").label).toBe("Join meeting");
    expect(meetingBrand("not a url").brand).toBe("generic");
  });
});
