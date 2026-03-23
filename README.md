# RPGMakerMZ-AI-Battle-Plugin
A collection of RPG Maker MZ plugins that leverage Large Language Models (LLMs) to take over actor battle decisions. It transforms traditional auto-battle into a dynamic, "intelligent" decision-making process based on the current battlefield state.

一套 RPG Maker MZ 插件，利用大语言模型 (LLM) 接管角色的战斗决策。它将传统的自动战斗转变为基于当前战场态势的动态“智能”决策过程。

Warning: This plugin might work not correctly, for learning and experimental use only.

注意：该插件可能工作不稳定，仅供实验和学习使用。

---

## 📑 Features / 功能特性

- **Two Versions / 两个版本**:
    - `ExternalAIBattle.js`: Supports online streaming APIs (OpenAI compatible). / 支持在线流式传输 API（兼容 OpenAI 格式）。
    - `OllamaBattleAI.js`: Optimized for local LLMs via Ollama. / 专为通过 Ollama 运行的本地模型优化。
- **Context Aware / 上下文感知**: Sends detailed battlefield data including HP, MP, TP, States, and Skill descriptions to the AI. / 向 AI 发送详细的战场数据，包括血量、蓝量、怒气、状态及技能描述。
- **State-Triggered / 状态触发**: AI takeover is activated only when a specific State (default ID: 62) is applied to an actor. / 仅当角色附加了特定状态（默认 ID: 62）时，才会激活 AI 接管。
- **Safety Mechanism / 安全机制**: Includes timeout control (AbortController) to prevent the game from freezing if the AI response is slow. Falls back to "Normal Attack" on failure. / 包含超时控制（AbortController），防止 AI 响应过慢导致游戏卡死。失败时会自动回退至“普通攻击”。

---

## 🛠 Installation / 安装步骤

1. Download the `.js` files and place them in your project's `js/plugins` folder.
   将 `.js` 文件下载并放入项目的 `js/plugins` 文件夹中。
2. Open **Plugin Manager** in RPG Maker MZ and help add either `ExternalAIBattle` or `OllamaBattleAI`.
   打开 RPG Maker MZ 的**插件管理器**，添加 `ExternalAIBattle` 或 `OllamaBattleAI`。
3. Create a **State** in the Database (e.g., "AI Mode") and note its ID.
   在数据库中创建一个**状态**（例如“自动战斗”），并记录其 ID。

---

## ⚙️ Configuration / 插件配置

### 1. ExternalAIBattle (Cloud/API)
- **API Key**: Your provider's API key. / 你的 API 密钥。
- **API Url**: Endpoint (e.g., `https://api.openai.com/v1/chat/completions`). / API 终端地址。
- **Model Name**: Target model (e.g., `gpt-4o`, `deepseek-chat`). / 模型名称。
- **Takeover State ID**: The ID of the state that triggers AI. / 触发 AI 的状态 ID。

### 2. OllamaBattleAI (Local)
- **Ollama URL**: Usually `http://localhost:11434/api/chat`. / 本地 Ollama 地址。
- **Model Name**: Local model (e.g., `qwen2.5:7b`, `llama3`). / 本地模型名称。
- **Timeout Duration**: Max seconds to wait for AI before force-attacking. / 强制普通攻击前的最大等待秒数。

---

## 🎮 How to Use / 如何使用

1. **Trigger AI**: In battle, use a skill, item, or script to apply the "Takeover State" to an actor.
   **触发 AI**: 在战斗中，通过技能、物品或脚本为角色附加“接管状态”。
2. **AI Decision**: When it's that actor's turn, the game will hide the command window and display "Character is thinking...".
   **AI 决策**: 轮到该角色行动时，游戏将隐藏指令窗口并显示“角色正在思考中...”。
3. **Execution**: The AI analyzes the data and returns a JSON command (Skill ID and Target Index), which the actor executes automatically.
   **执行**: AI 分析数据并返回 JSON 指令（技能 ID 和目标索引），角色将自动执行。

---

## 📝 Prompt Logic / 提示词逻辑

The plugins automatically construct a prompt containing:
插件会自动构造包含以下信息的提示词：
- **Self Status**: Current HP/MP/TP and States. / **自身状态**: 当前血量、蓝量、怒气和状态。
- **Allies & Enemies**: List of names, health status, and active states. / **队友与敌人**: 名字列表、生命状态和当前状态。
- **Available Skills**: Names and descriptions for the AI to choose from. / **可用技能**: 供 AI 选择的技能名称和描述。

**Constraint**: The AI must return a strict JSON format: `{"skillId": ID, "targetIndex": Index}`.
**约束**: AI 必须返回严格的 JSON 格式：`{"skillId": 技能ID, "targetIndex": 目标索引}`。

---

## ⚠️ Requirements / 运行要求

- **RPG Maker MZ** (废话).
- For `OllamaBattleAI`: [Ollama](https://ollama.com/) must be running locally.
- For `ExternalAIBattle`: An active internet connection and valid API key.

---

## 📄 License / 许可证

This project is licensed under the [Apache 2.0 License](LICENSE).
本项目遵循 [Apache 2.0 许可证](LICENSE)。

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!
欢迎提供建议、反馈问题或提交功能请求！
