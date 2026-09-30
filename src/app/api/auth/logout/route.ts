// Same behaviour as /api/auth/signout (the route the app calls): this used to
// only delete the cookie, leaving the tokens themselves valid.
export const runtime = "nodejs";
export { POST } from "../signout/route";
