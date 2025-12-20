/**
 * Quick test script to verify Luxor API V2 response format for subaccounts
 */

async function testLuxorAPI() {
  const luxorToken = process.env.LUXOR_API_KEY;

  if (!luxorToken) {
    console.error("LUXOR_API_KEY is not set in environment");
    process.exit(1);
  }

  console.log("Testing Luxor API V2 subaccounts endpoint...\n");

  try {
    const url = new URL("https://app.luxor.tech/api/v2/pool/subaccounts");
    url.searchParams.append("page_number", "1");
    url.searchParams.append("page_size", "10");

    console.log(`Fetching: ${url.toString()}\n`);

    const response = await fetch(url.toString(), {
      headers: {
        authorization: `Bearer ${luxorToken}`,
      },
    });

    if (!response.ok) {
      console.error(`API returned ${response.status}: ${response.statusText}`);
      process.exit(1);
    }

    const data = await response.json();
    console.log("Full API Response:");
    console.log(JSON.stringify(data, null, 2));

    if (data.subaccounts && data.subaccounts.length > 0) {
      console.log("\n\nFirst Subaccount Details:");
      const firstSubaccount = data.subaccounts[0];
      console.log({
        id: firstSubaccount.id,
        name: firstSubaccount.name,
        created_at: firstSubaccount.created_at,
        created_at_type: typeof firstSubaccount.created_at,
        has_created_at: "created_at" in firstSubaccount,
        url: firstSubaccount.url,
        site: firstSubaccount.site,
      });

      console.log("\n\nAll subaccount keys:");
      console.log(Object.keys(firstSubaccount));
    }
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

testLuxorAPI();
