/**
 * preflight-skills plugin for OpenCode.ai
 *
 * Registers this repo's skills directory via OpenCode's config hook so
 * crew-review and crew-consult are discoverable without manual symlinks.
 *
 * Unlike superpowers (whose plugin also injects a bootstrap skill into every
 * session's first message), preflight-skills has no always-on skill to
 * force-load: crew-review and crew-consult are opt-in, triggered by their own
 * descriptions, and invoked explicitly. So this plugin only does discovery
 * registration — the minimal installable subset for OpenCode.
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PreflightSkillsPlugin = async () => {
  const preflightSkillsDir = path.resolve(__dirname, '../../skills');

  return {
    // Inject skills path into live config so OpenCode discovers the
    // crew-review / crew-consult skills without manual symlinks or config
    // file edits.
    config: async (config) => {
      config.skills = config.skills || {};
      config.skills.paths = config.skills.paths || [];
      if (!config.skills.paths.includes(preflightSkillsDir)) {
        config.skills.paths.push(preflightSkillsDir);
      }
    },
  };
};
