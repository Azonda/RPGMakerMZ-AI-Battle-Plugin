/*:
 * @target MZ
 * @plugindesc [v1.7] 使用流式传输 API 接管角色战斗决策
 * @author AI Assistant
 * 
 * @param apiKey
 * @text API Key
 * @default sk-xxx
 *
 * @param apiUrl
 * @text API 地址 (Endpoint)
 * @default http://api.xxx/v1/chat/completions
 *
 * @param modelName
 * @text 模型名称
 * @default gpt-5.4
 *
 * @param takeoverStateId
 * @text 接管状态 ID
 * @type state
 * @default 62
 *
 * @param timeoutDuration
 * @text 超时时间 (秒)
 * @type number
 * @default 20
 */

(() => {
    const pluginName = "ExternalAIBattle";
    const parameters = PluginManager.parameters(pluginName);
    
    const API_KEY = parameters['apiKey'];
    const API_URL = parameters['apiUrl'];
    const MODEL_NAME = parameters['modelName'];
    const STATE_ID = Number(parameters['takeoverStateId'] || 62);
    const TIMEOUT_MS = Number(parameters['timeoutDuration'] || 20) * 1000;

    async function fetchAIAction(actor) {
        const enemies = $gameTroop.aliveMembers().map((e, index) => ({
            index: index,
            name: e.originalName(),
            hp: `${e.hp}/${e.mhp}`,
            states: e.states().map(s => s.name)
        }));

        const allies = $gameParty.battleMembers().map(m => ({
            name: m.name(),
            hp: `${m.hp}/${m.mhp}`,
            mp: `${m.mp}/${m.mmp}`,
            states: m.states().map(s => s.name),
            isSelf: m === actor
        }));

        const skills = actor.skills().map(s => ({
            id: s.id,
            name: s.name,
            description: s.description,
            targetType: s.scope === 1 ? "单个敌人" : (s.scope === 7 ? "单个队友" : "其他")
        }));

        const prompt = `
角色:${actor.name()} HP:${actor.hp}/${actor.mhp} MP:${actor.mp}
队友:${JSON.stringify(allies)}
敌人:${JSON.stringify(enemies)}
技能:${JSON.stringify(skills)}
任务:判断自己是防御型、进攻型、奶妈还是辅助型角色，选出最优技能ID和目标索引。
必须只返回JSON:{"skillId":ID, "targetIndex":索引}`;

        const requestBody = {
            model: MODEL_NAME,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
            stream: true
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        try {
            console.log(`%c[AI 决策中...] 正在连接流式 API...`, "color: #00bfff");
            
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_KEY}`
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            // --- 处理流式响应核心逻辑（修复版） ---
            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let fullContent = "";
            let buffer = ""; // 用于缓存跨 chunk 的不完整行

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                // 将新数据追加到缓冲区
                buffer += decoder.decode(value, { stream: true });
                
                // 按换行符分割，但保留最后一个可能不完整的部分
                const lines = buffer.split("\n");
                // 最后一个元素可能是不完整的行，保留在缓冲区
                buffer = lines.pop() || "";

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    
                    // 跳过空行
                    if (trimmedLine === "") continue;
                    // 跳过 SSE 注释行（以冒号开头）
                    if (trimmedLine.startsWith(":")) continue;
                    // 跳过 [DONE] 信号
                    if (trimmedLine === "data: [DONE]" || trimmedLine === "[DONE]") continue;

                    // 提取 data: 后面的内容
                    let jsonStr = trimmedLine;
                    if (jsonStr.startsWith("data:")) {
                        jsonStr = jsonStr.substring(5).trim();
                    }

                    // 再次检查提取后是否为空或为 [DONE]
                    if (jsonStr === "" || jsonStr === "[DONE]") continue;

                    try {
                        const parsed = JSON.parse(jsonStr);
                        if (parsed.choices && parsed.choices[0]) {
                            const delta = parsed.choices[0].delta;
                            if (delta && delta.content) {
                                fullContent += delta.content;
                            }
                        }
                    } catch (e) {
                        // 如果解析失败，可能是跨行的 JSON，将其放回缓冲区
                        // 但通常 SSE 的每个 data: 行都是完整的 JSON
                        console.warn("[AI 战斗] 跳过无法解析的数据块:", jsonStr);
                    }
                }
            }

            // 处理缓冲区中剩余的数据
            if (buffer.trim() !== "" && buffer.trim() !== "[DONE]" && buffer.trim() !== "data: [DONE]") {
                let remaining = buffer.trim();
                if (remaining.startsWith("data:")) {
                    remaining = remaining.substring(5).trim();
                }
                if (remaining !== "" && remaining !== "[DONE]") {
                    try {
                        const parsed = JSON.parse(remaining);
                        if (parsed.choices && parsed.choices[0]) {
                            const delta = parsed.choices[0].delta;
                            if (delta && delta.content) {
                                fullContent += delta.content;
                            }
                        }
                    } catch (e) {
                        console.warn("[AI 战斗] 跳过残余数据:", remaining);
                    }
                }
            }
            // --- 处理结束 ---

            clearTimeout(timeoutId);
            console.log("%c[AI 完整回复]", "color: #00ff00", fullContent);

            const jsonMatch = fullContent.match(/\{[\s\S]*?\}/);
            if (jsonMatch) {
                const result = JSON.parse(jsonMatch[0]);
                console.log("%c[AI 指令解析成功]", "color: #00ff00", result);
                return result;
            } else {
                throw new Error("无法从流中解析出 JSON 指令，完整内容: " + fullContent);
            }

        } catch (e) {
            clearTimeout(timeoutId);
            console.error("[AI 战斗] 错误:", e);
            return null;
        }
    }

    const _Scene_Battle_startActorCommandSelection = Scene_Battle.prototype.startActorCommandSelection;
    Scene_Battle.prototype.startActorCommandSelection = function() {
        const actor = BattleManager.actor();
        if (actor && actor.isStateAffected(STATE_ID)) {
            this._actorCommandWindow.deactivate();
            this._actorCommandWindow.hide();
            if (actor._isAiThinking) return; 
            actor._isAiThinking = true;
            this.executeAiTurn(actor);
        } else {
            _Scene_Battle_startActorCommandSelection.call(this);
        }
    };

    Scene_Battle.prototype.executeAiTurn = async function(actor) {
        BattleManager._logWindow.push('addText', `${actor.name()} 正在决策中...`);

        let actionData = await fetchAIAction(actor);
        actor._isAiThinking = false;

        const action = new Game_Action(actor);
        BattleManager._logWindow.push('clear');

        let skillId = actionData ? actionData.skillId : actor.attackSkillId();
        
        if (!$dataSkills[skillId] || !actor.skills().some(s => s.id === skillId) || !actor.canPaySkillCost($dataSkills[skillId])) {
            console.warn(`[AI 战斗] 技能 ${skillId} 无效或无法使用，回退为普通攻击`);
            skillId = actor.attackSkillId();
        }

        action.setSkill(skillId);
        const targetIdx = actionData && actionData.targetIndex !== undefined ? actionData.targetIndex : 0;
        action.setTarget(targetIdx);

        actor.setAction(0, action);
        BattleManager.selectNextCommand();
    };

    const _BattleManager_endBattle = BattleManager.endBattle;
    BattleManager.endBattle = function(result) {
        $gameParty.members().forEach(actor => { actor._isAiThinking = false; });
        _BattleManager_endBattle.call(this, result);
    };

    const _Window_ActorCommand_activate = Window_ActorCommand.prototype.activate;
    Window_ActorCommand.prototype.activate = function() {
        const actor = BattleManager.actor();
        if (actor && actor.isStateAffected(STATE_ID)) return;
        _Window_ActorCommand_activate.call(this);
    };

})();
