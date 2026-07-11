import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Registers this repo's skills directory with Pi's skill discovery so
// crew-review and crew-consult are found without manual configuration.
//
// Unlike superpowers's Pi extension (which also injects a bootstrap skill
// into context on every session), flightcrew-skills has no always-on skill
// to force-load: crew-review and crew-consult are opt-in, triggered by their
// own descriptions. So this extension only does discovery registration —
// the minimal installable subset for Pi.

const extensionDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(extensionDir, "../..");
const skillsDir = resolve(packageRoot, "skills");

export default function flightcrewSkillsPiExtension(pi: ExtensionAPI) {
	pi.on("resources_discover", async () => ({
		skillPaths: [skillsDir],
	}));
}
