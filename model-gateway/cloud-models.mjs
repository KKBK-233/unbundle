// 使用官方型号让 Desktop 识别能力；旧名称保留为已有会话的兼容入口。
const tiers = ['sonnet', 'opus', 'haiku'];
const labels = { sonnet: 'Sonnet 5.5', opus: 'Opus 5.5', haiku: 'Haiku 5.5' };
export const modelAliases = Object.fromEntries(tiers.map(tier => [`claude-code-${tier}`, `claude-${tier}-5-5`]));
export const upstreamModels = Object.fromEntries(tiers.map(tier => [
  `claude-${tier}-5-5`, `claude-${tier}-5-5${tier === 'haiku' ? '' : '[1m]'}`,
]));
export function cloudModels(contextWindow) {
  return tiers.map(tier => ({
    id: `claude-${tier}-5-5`, object: 'model', owned_by: 'velella-cloud',
    display_name: labels[tier], anthropic_family_tier: tier, is_family_default: true,
    context_window: contextWindow,
  }));
}
