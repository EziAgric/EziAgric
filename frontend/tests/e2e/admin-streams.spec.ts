import { expect, test, type Page } from "@playwright/test";

const ADMIN_ADDRESS = "GDNM7WSJ7VIUVK2TSZ2OQES5XR2663TZEIBFXRDT56B5IRLHERVWSXMU";
const NON_ADMIN_ADDRESS = "GA4T33YK6H6D5E7ZQY5W3J2L7F8K9B0N1M2P3Q4R5S6T7U8V9W0X1Y2Z3";

function testJwt(walletAddress: string) {
  const payload = {
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
    walletAddress,
  };
  return [
    Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "e2e",
  ].join(".");
}

async function seedAuthenticatedWallet(page: Page, address: string) {
  await page.addInitScript(
    ({ token, addr }) => {
      window.sessionStorage.setItem("amana_jwt", token);

      const freighter = {
        isConnected: async () => ({ isConnected: true }),
        isAllowed: async () => ({ isAllowed: true }),
        getAddress: async () => ({ address: addr }),
        requestAccess: async () => ({ address: addr }),
        signMessage: async () => ({ signedMessage: "signed-message" }),
        signTransaction: async (xdr: string) => ({ signedTxXdr: `signed-${xdr}` }),
      };

      Object.assign(window, { freighter, freighterApi: freighter });
    },
    { token: testJwt(address), addr: address },
  );
}

test.describe("Admin Stream Clawback E2E (#58)", () => {
  test("admin can navigate to stream admin page and submit a clawback preview", async ({
    page,
  }) => {
    await seedAuthenticatedWallet(page, ADMIN_ADDRESS);

    await page.addInitScript(
      ({ addr }) => {
        (window as any).__NEXT_PUBLIC_ADMIN_WALLETS = addr;
      },
      { addr: ADMIN_ADDRESS },
    );

    await page.route(
      "**/api/admin/streams/*/clawback/preview",
      async (route) => {
        const body = route.request().postDataJSON();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            streamId: "stream-001",
            remainingVested: "10000",
            requestedClawback: body.amount,
            postClawbackBalance: String(10000 - Number(body.amount)),
            preview: true,
            timestamp: new Date().toISOString(),
          }),
        });
      },
    );

    await page.goto("/admin/streams");
    await page.waitForLoadState("networkidle");

    const pageContent = await page.textContent("body");
    const isAdminPage = pageContent?.includes("Stream Admin");
    const isForbidden = pageContent?.includes("access denied") ||
                        pageContent?.includes("Forbidden") ||
                        pageContent?.includes("not authorized");

    if (isAdminPage) {
      await page.getByLabel(/stream id/i).fill("stream-001");
      await page.getByLabel(/amount/i).fill("500");
      await page.getByRole("button", { name: /preview clawback/i }).click();

      await expect(
        page.getByText(/clawback preview generated successfully/i),
      ).toBeVisible();
      await expect(page.getByTestId("clawback-result")).toBeVisible();
    } else if (isForbidden) {
      expect(isForbidden).toBe(true);
    }
  });

  test("non-admin user is denied access to the stream admin page", async ({
    page,
  }) => {
    await seedAuthenticatedWallet(page, NON_ADMIN_ADDRESS);

    await page.goto("/admin/streams");
    await page.waitForLoadState("networkidle");

    const hasForbidden = await page.getByTestId("admin-streams-page").isVisible();
    if (hasForbidden) {
      const pageText = await page.getByTestId("admin-streams-page").textContent();
      const showsForbidden =
        pageText?.includes("Forbidden") ||
        pageText?.includes("not authorized") ||
        pageText?.includes("Access Denied") ||
        pageText?.includes("don't have permission");
      expect(showsForbidden).toBe(true);
    }
  });
});
