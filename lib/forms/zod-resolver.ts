// Client forms import their resolver from here. Zod's no-eval mode is set by
// instrumentation-client.ts; importing it again keeps forms safe if that file
// ever moves (D-096).
import "@/lib/security/zod-jitless";

export { zodResolver } from "@hookform/resolvers/zod";
