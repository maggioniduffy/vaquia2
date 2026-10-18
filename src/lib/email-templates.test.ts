import { describe, expect, it } from "vitest";
import { invitationEmail, otpEmail } from "./email-templates";

const url = "https://vaquia.vercel.app/signup";

describe("invitationEmail", () => {
  it("escapes user input in html", () => {
    const { html } = invitationEmail({
      personName: `<script>alert(1)</script> "Ana"`,
      companyName: `Acme' <b>&</b>`,
      url,
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>&</b>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot;Ana&quot;");
    expect(html).toContain("Acme&#39; &lt;b&gt;&amp;&lt;/b&gt;");
  });

  it("includes the url in text and html and the company in the subject", () => {
    const mail = invitationEmail({ personName: "Nestor", companyName: "zz", url });
    expect(mail.text).toContain(url);
    expect(mail.html).toContain(url);
    expect(mail.text).toContain("Nestor");
    expect(mail.text).toContain("zz");
    expect(mail.subject).toContain("zz");
  });

  it("keeps the subject plain text", () => {
    const mail = invitationEmail({ personName: "A", companyName: "R&D <x>", url });
    expect(mail.subject).toContain("R&D <x>");
  });
});

describe("otpEmail", () => {
  it("includes the code in text and html", () => {
    const mail = otpEmail({ code: "482913" });
    expect(mail.text).toMatch(/\b\d{6}\b/);
    expect(mail.text).toContain("482913");
    expect(mail.html).toContain("482913");
  });
});
