export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/me" && request.method === "GET") {
      const authHeader = request.headers.get("Authorization");

      if (!authHeader) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          message: "Hello from the upstream API",
          timestamp: "2026-04-13T10:00:00.000Z",
          receivedAuthorization: true,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response("Not Found", { status: 404 });
  },
};
