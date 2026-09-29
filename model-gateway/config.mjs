import os from 'node:os';
import path from 'node:path';

// 集中声明名称与路径，运行状态始终留在仓库的忽略目录内。
export const root = path.resolve(import.meta.dirname, '..');
export const providerId = 'claude-code-relay';
export const modelId = 'claude-code-deepseek';
export const modelSelector = `${providerId}/${modelId}`;
export const stateDir = path.join(root, '.local', 'model-gateway');
export const modelsFile = () => process.env.OMP_MODELS_FILE || path.join(os.homedir(), '.omp', 'agent', 'models.yml');
export const claudeCli = () => process.env.CLAUDE_CODE_CLI || path.join(root, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude');
export const ompCli = () => process.env.OMP_CLI || (process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'omp', 'omp.exe') : 'omp');
