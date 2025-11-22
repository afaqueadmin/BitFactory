function randomPrice() {
  const min = 80000;
  const max = 130000;

  const num = Math.random() * (max - min) + min;
  return num.toFixed(8);
}
export async function GET() {
  // If running in development mode → return mock data
  if (process.env.NODE_ENV === "development") {
    return Response.json({
      symbol: "BTCUSDT",
      price: randomPrice(),
      timestamp: Date.now(),
    });
  }

  // Production mode → call real API
  const apiUrl = "https://api.api-ninjas.com/v1/cryptoprice?symbol=BTCUSDT";

  try {
    const response = await fetch(apiUrl, {
      headers: {
        "X-Api-Key": process.env.API_NINJAS_KEY || "",
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("API request failed");
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    return Response.json({ error: "Error getting BTC price" }, { status: 500 });
  }
}
