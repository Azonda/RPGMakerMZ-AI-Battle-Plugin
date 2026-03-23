/*:
 * @target MZ
 * @plugindesc 使用 Ollama 接管战斗 (v1.4 增强版 + 超时控制)
 * @author AI Assistant
 * 
 * @param ollamaUrl
 * @text Ollama API 地址
 * @default http://localhost:11434/api/chat
 *
 * @param modelName
 * @text 模型名称
 * @default qwen2.5:7b
 *
 * @param takeoverStateId
 * @text 接管状态 ID
 * @type state
 * @default 62
 *
 * @param timeoutDuration
 * @text 超时时间 (秒)
 * @desc AI 思考的最大时间。超过此时间将强制使用普通攻击。
 * @type number
 * @min 1
 * @default 15
 *
 * @help
 * 增强版 v1.4：
 * - 注入了详细的战斗环境数据（血量/蓝量/TP/状态/技能描述）。
 * - 增加了超时自动阻断机制 (AbortController)。如果AI请求太久，
 *   防卡死系统会主动切断连接并使用普通攻击。
 */

(() => {
    const pluginName = "OllamaBattleAI";
    const parameters = PluginManager.parameters(pluginName);
    const OLLAMA_URL = parameters['ollamaUrl'];
    const MODEL_NAME = parameters['modelName'];
    const STATE_ID = Number(parameters['takeoverStateId'] || 62);
    const TIMEOUT_MS = Number(parameters['timeoutDuration'] || 15) * 1000; // 转换为毫秒

    if (Utils.isOptionValid("test")) {
        require('nw.gui').Window.get().showDevTools();
        console.log("%c[Ollama AI] v1.4 已加载：上下文增强 + 超时保护实装", "color: #00ff00; font-weight: bold;");
    }

    async function fetchOllamaAction(actor) {
        // 1. 获取敌人详细状态
        const enemies = $gameTroop.aliveMembers().map((e, index) => ({
            index: index,
            name: e.originalName(),
            hp: `${e.hp}/${e.mhp}`,
            states: e.states().map(s => s.name)
        }));

        // 2. 获取队友详细状态 (不含当前操作者)
        const allies = $gameParty.battleMembers()
            .filter(member => member !== actor)
            .map(m => ({
                name: m.name(),
                hp: `${m.hp}/${m.mhp}`,
                mp: `${m.mp}/${m.mmp}`,
                states: m.states().map(s => s.name),
                isAlive: m.isAlive()
            }));

        // 3. 获取自身状态
        const selfStatus = {
            name: actor.name(),
            hp: `${actor.hp}/${actor.mhp}`,
            mp: `${actor.mp}/${actor.mmp}`,
            tp: actor.tp,
            states: actor.states().map(s => s.name)
        };

        // 4. 获取技能详细描述
        const skills = actor.skills().map(s => ({
            id: s.id,
            name: s.name,
            mpCost: s.mpCost,
            tpCost: s.tpCost,
            description: s.description,
            target: s.scope === 1 ? "单个敌人" : (s.scope === 7 ? "单个队友" : "其他")
        }));

        // 5. 构造增强提示词
        const prompt = `
你现在是 RPG 游戏中的角色: ${actor.name()}。
你的当前状态: ${JSON.stringify(selfStatus)}。
你的队友状态: ${JSON.stringify(allies)}。
战场上的敌人: ${JSON.stringify(enemies)}。
你可以使用的技能列表: ${JSON.stringify(skills)}。

任务：
1. 分析当前形势（如果队友血量低，考虑治疗；如果敌人血量低，考虑收割）。
2. 从技能列表中选择一个最合理的技能 ID。
3. 选择一个目标索引 (如果是攻击技能，目标是敌人索引；如果是治疗技能，目标是队友索引)。

注意：
- 必须严格返回 JSON 格式，例如：{"skillId": 1, "targetIndex": 0}。
- 不要返回任何多余的解释文字。
- 目标索引 targetIndex 必须在有效范围内。
`.trim();

        const requestBody = {
            model: MODEL_NAME,
            messages: [{ role: "user", content: prompt }],
            stream: false,
            format: "json"
        };

        console.log(`%c--- [${actor.name()}] 正在上传战场数据并等待决策 (限制时长: ${TIMEOUT_MS/1000}s) ---`, "color: #00bfff; font-weight: bold;");
        const startTime = performance.now();

        // 【核心新增】：超时控制器
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort(); // 超时触发，强制中断网络请求
        }, TIMEOUT_MS);

        try {
            const response = await fetch(OLLAMA_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal: controller.signal // 将中止信号传入 fetch
            });

            // 如果成功响应，清除超时器
            clearTimeout(timeoutId); 

            if (!response.ok) throw new Error(`HTTP 状态码: ${response.status}`);

            const data = await response.json();
            const endTime = performance.now();
            
            console.log(`%c-> AI 决策完成! (耗时: ${((endTime - startTime) / 1000).toFixed(2)} 秒)`, "color: #00ff00;");
            
            return JSON.parse(data.message.content);

        } catch (e) {
            clearTimeout(timeoutId); // 发生错误也要清除超时器
            
            if (e.name === 'AbortError') {
                console.warn(`%c[网络超时]: AI 思考超过 ${TIMEOUT_MS / 1000} 秒，连接已强制切断，转为默认行动。`, "color: #ff8c00; font-weight: bold;");
            } else {
                console.error("%c[通信/解析失败]:", "color: #ff0000; font-weight: bold;", e.message);
            }
            return null; // 返回 null 触发普通攻击逻辑
        }
    }

    const _Scene_Battle_startActorCommandSelection = Scene_Battle.prototype.startActorCommandSelection;
    Scene_Battle.prototype.startActorCommandSelection = function() {
        const actor = BattleManager.actor();
        if (actor && actor.isStateAffected(STATE_ID)) {
            this._actorCommandWindow.deactivate();
            this._actorCommandWindow.hide();

            if (actor._isOllamaThinking) return; 
            
            actor._isOllamaThinking = true;
            this.executeOllamaTurn(actor);
        } else {
            _Scene_Battle_startActorCommandSelection.call(this);
        }
    };

    Scene_Battle.prototype.executeOllamaTurn = async function(actor) {
        BattleManager._logWindow.push('addText', `${actor.name()} 正在观察战场...`);

        let actionData = null;
        try {
            actionData = await fetchOllamaAction(actor);
        } catch (error) {
            console.error("执行过程错误:", error);
        } finally {
            actor._isOllamaThinking = false; // 无论超时与否，一定会释放锁
        }

        const action = new Game_Action(actor);
        BattleManager._logWindow.push('clear');

        let skillId = actionData ? actionData.skillId : 1;
        
        // 如果 actionData 为空 (比如超时)，强制设置为普攻ID
        if (!actionData) {
            skillId = actor.attackSkillId(); 
        } else if (!actor.skills().some(s => s.id === skillId)) {
            // 如果 AI 给了非法 ID，回退为普攻
            console.warn(`AI 选择了非法技能ID: ${skillId}，回退到普通攻击`);
            skillId = actor.attackSkillId(); 
        }

        action.setSkill(skillId);
        
        // 目标索引处理
        const targetIdx = actionData ? actionData.targetIndex : 0;
        action.setTarget(targetIdx);

        actor.setAction(0, action);
        BattleManager.selectNextCommand();
    };

    const _Window_ActorCommand_activate = Window_ActorCommand.prototype.activate;
    Window_ActorCommand.prototype.activate = function() {
        if (BattleManager.actor() && BattleManager.actor().isStateAffected(STATE_ID)) return;
        _Window_ActorCommand_activate.call(this);
    };

    const _BattleManager_endBattle = BattleManager.endBattle;
    BattleManager.endBattle = function(result) {
        $gameParty.members().forEach(actor => { actor._isOllamaThinking = false; });
        _BattleManager_endBattle.call(this, result);
    };

})();
