function getGenerationErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isGeminiImageProviderRoutingError(lowerMessage: string): boolean {
  return lowerMessage.includes('no provider for') && lowerMessage.includes('gemini_native');
}

function isUpstreamOverloadedError(lowerMessage: string): boolean {
  return (
    lowerMessage.includes('system cpu overloaded')
    || lowerMessage.includes('system memory overloaded')
    || lowerMessage.includes('cpu overloaded')
    || lowerMessage.includes('memory overloaded')
    || lowerMessage.includes('system overloaded')
    || lowerMessage.includes('server overloaded')
    || lowerMessage.includes('upstream overloaded')
    || lowerMessage.includes('负载已饱和')
    || lowerMessage.includes('系统繁忙')
    || lowerMessage.includes('内存过载')
    || lowerMessage.includes('内存不足')
  );
}

function isBadGatewayStatusError(lowerMessage: string): boolean {
  return (
    lowerMessage.includes('bad response status code 502')
    || lowerMessage.includes('bad response status code 503')
    || lowerMessage.includes('bad response status code 504')
  );
}

export function isRecoverableGenerationSubmissionError(error: unknown): boolean {
  const lower = getGenerationErrorMessage(error).toLowerCase();

  return (
    lower.includes('timeout')
    || lower.includes('aborted')
    || lower.includes('deadline')
    || lower.includes('fetch failed')
    || lower.includes('networkerror')
    || lower === 'failed to fetch'
    || lower.includes('network request failed')
    || lower.includes('err_connection')
    || lower.includes('econnrefused')
    || lower.includes('dns')
    || lower.includes('上游服务连接失败')
    || lower.includes('无法连接到 ai 服务')
  );
}

export function withSubmissionRecoveryHint(message: string): string {
  if (!message.trim()) {
    return '请求已中断，已保留本次提交记录，刷新页面后会自动重试。';
  }

  if (message.includes('已保留本次提交记录')) {
    return message;
  }

  return `${message}\n\n已保留本次提交记录，刷新页面后会自动重试。`;
}

export function classifyGenerationError(
  kind: 'image' | 'video',
  error: unknown,
): string {
  const msg = getGenerationErrorMessage(error);
  const lower = msg.toLowerCase();
  const mediaLabel = kind === 'image' ? '图片' : '视频';

  if (kind === 'image' && isGeminiImageProviderRoutingError(lower)) {
    return `🤖 Gemini 生图通道暂不可用\n\n当前不是提示词问题，而是上游没有把这把 API Key 路由到可用的 Gemini 生图通道。\n\n你可以先这样处理：\n• 稍后再试\n• 更换一把已验证可用的 API Key\n• 联系第三方检查 default 组 / Gemini 图片通道\n\n上游原始错误：${msg}`;
  }

  if (isUpstreamOverloadedError(lower)) {
    return `🚦 上游服务繁忙\n\n当前 ${mediaLabel} 生成请求已经发到上游，但上游暂时没有可用算力或内存容量。\n\n建议：\n• 稍后重试\n• 图片任务优先降到 1K/2K，避免继续打 4K 大尺寸\n• 如果持续出现，联系第三方检查当前分组容量\n\n上游原始错误：${msg}`;
  }

  if (isBadGatewayStatusError(lower)) {
    return `🔧 上游服务暂时不可用\n\n当前 ${mediaLabel} 生成请求已经发到上游，但上游返回了网关错误。\n\n建议：\n• 稍后重试\n• 如果持续出现，联系第三方检查对应模型通道\n\n上游原始错误：${msg}`;
  }

  if (
    lower.includes('fetch')
    || lower.includes('networkerror')
    || lower === 'failed to fetch'
    || lower.includes('network request failed')
    || lower.includes('err_connection')
    || lower.includes('econnrefused')
    || lower.includes('dns')
  ) {
    return `⚠ 网络连接失败\n\n无法连接到${mediaLabel}生成服务，请检查：\n• API 地址是否正确（右上角 ⚙ 设置）\n• 网络连接是否正常\n• 开发服务器是否已启动\n\n原始错误：${msg}`;
  }

  if (lower.includes('timeout') || lower.includes('aborted') || lower.includes('deadline')) {
    return kind === 'video'
      ? '⏱ 请求超时\n\n服务器响应时间过长，可能原因：\n• 视频生成通常需要较长时间\n• 当前 AI 服务负载较高\n\n请稍后重试。'
      : '⏱ 请求超时\n\n服务器响应时间过长，可能原因：\n• 当前 AI 服务负载较高\n• 网络延迟\n\n请稍后重试。';
  }

  if (
    lower.includes('api_key')
    || lower.includes('api key')
    || lower.includes('未配置')
    || lower.includes('unauthorized')
    || lower.includes('invalid key')
    || lower.includes('密钥')
  ) {
    return '🔑 API 密钥错误\n\nAPI 密钥未配置或无效，请点击右上角 ⚙ 设置，填写正确的 API Key。';
  }

  if (
    lower.includes('rate limit')
    || lower.includes('too many')
    || lower.includes('429')
    || lower.includes('频繁')
  ) {
    return '🚫 请求过于频繁\n\nAPI 请求被限流，请等待几秒后重试。';
  }

  if (
    lower.includes('quota')
    || lower.includes('insufficient')
    || lower.includes('余额')
    || lower.includes('credit')
    || lower.includes('billing')
  ) {
    return '💳 额度不足\n\nAPI 账户余额不足，请充值或更换 API Key。';
  }

  if (
    lower.includes('safety')
    || lower.includes('blocked')
    || lower.includes('拦截')
    || lower.includes('content policy')
    || lower.includes('moderation')
  ) {
    return '🛡 内容被安全策略拦截\n\n请修改提示词后重试，避免包含敏感或违规内容。';
  }

  if (
    kind === 'image'
    && (
      lower.includes('could not generate')
      || lower.includes('无法根据')
      || lower.includes('unable to generate')
    )
  ) {
    return '🎨 生成失败\n\n模型无法根据当前提示词生成图片，请尝试：\n• 修改提示词描述\n• 更换或移除参考图\n• 使用其他模型';
  }

  if (
    lower.includes('too large')
    || lower.includes('payload')
    || lower.includes('413')
    || lower.includes('body exceeded')
  ) {
    return kind === 'video'
      ? '📦 请求数据过大\n\n参考图片或视频帧体积超出限制，请压缩后重试。'
      : '📦 请求数据过大\n\n参考图片体积超出限制，请压缩图片或减少参考图数量后重试。';
  }

  if (
    lower.includes('model')
    && (lower.includes('not found') || lower.includes('not exist') || lower.includes('not available'))
  ) {
    return '🤖 模型不可用\n\n所选模型当前不可用或不存在，请更换其他模型重试。';
  }

  const statusMatch = msg.match(/服务器错误\s*\((\d+)\)/);
  if (statusMatch) {
    const code = statusMatch[1];
    if (code === '500') {
      return `❌ 服务端内部错误 (500)\n\n上游 AI 服务可能暂时不可用，请稍后重试。\n\n详情：${msg}`;
    }
    if (code === '502' || code === '503') {
      return `🔧 服务暂时不可用 (${code})\n\n上游 AI 服务正在维护或暂时不可用，请稍后重试。`;
    }
    if (code === '504') {
      return '⏱ 网关超时 (504)\n\n上游 AI 服务响应超时，请稍后重试。';
    }
    if (code === '401' || code === '403') {
      return `🔑 认证失败 (${code})\n\nAPI Key 无效或权限不足，请在右上角 ⚙ 设置中检查。`;
    }
    if (code === '404') {
      return '❓ 接口不存在 (404)\n\nAPI 地址可能配置错误，请检查 API Base URL 设置。';
    }

    return `❌ 服务器错误 (${code})\n\n${msg}`;
  }

  return msg || `${mediaLabel}生成失败，请稍后重试。`;
}

export function summarizeGenerationError(error: string | null | undefined): string {
  if (!error?.trim()) return '生成失败';

  const firstLine = error
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || '生成失败';

  return firstLine.replace(/^[^\p{L}\p{N}\u4e00-\u9fff]+/u, '').trim() || '生成失败';
}
