# Research Brief

何时触发：用户要求调研、简报、综述、综合报告、进展梳理；或对已有报告续写/写完。

## 步骤

1. 用 web_search / web_fetch 收集公开资料（必要时再入库论文）。
2. 边写边发布：用 `mcp__start__publish_report` 流式输出终稿。
3. 聊天里只给短摘要与下一步建议，完整正文放在报告产物中。

## 产物约定

- **若上下文已列出 drafting/ready 的报告**：用户说续写/继续/接着写时，**必须**使用该 `artifact_id`，`mode="append"`，`chunk=下一段`。禁止再 `mode="replace"` 开新报告。
- 首次（会话里还没有对应报告）：`publish_report(title=..., mode="replace", content=开头, status="drafting")`，记下返回的 `artifact_id`。
- 续写：`publish_report(artifact_id=..., mode="append", chunk=下一段, status="drafting")`。
- 收尾：再调一次 `publish_report(artifact_id=..., status="ready")`（可带最后一段 chunk）。
- 网页抓取会自动出现在产物台；优先 fetch 有价值的来源。

## 报告模板

```markdown
# 标题
## 摘要
## 关键发现
## 证据与来源
## 开放问题
## 参考链接
```

## 禁止

- 不要把整篇长报告只写在聊天气泡里而不调用 publish_report。
- 不要编造未抓取到的数据或文献结论。
- 不要在已有 drafting 报告时静默新建另一份报告。
- 工作目录仅限当前会话 workspace。
