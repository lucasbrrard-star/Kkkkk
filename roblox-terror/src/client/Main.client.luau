-- Colheita Sombria — script do cliente.
-- Controles, interface, raio de terror, luzes piscando e o moinho girando.

local CollectionService = game:GetService("CollectionService")
local ContextActionService = game:GetService("ContextActionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local SoundService = game:GetService("SoundService")

local player = Players.LocalPlayer
local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local Remotes = require(Shared:WaitForChild("Remotes"))
local Hud = require(script.Parent:WaitForChild("Hud"))

local Action = Remotes.get("Action")
local hud = Hud.create(player:WaitForChild("PlayerGui") :: PlayerGui)

local function role(): string
	return player:GetAttribute("Role") or "Lobby"
end

---------------------------------------------------------------------------------
-- Controles (mudam conforme o papel). No celular aparecem botões na tela.
---------------------------------------------------------------------------------
local BOUND = { "Correr", "Lanterna", "Atacar", "Uivo", "Investida" }

local function onSprint(_, state: Enum.UserInputState)
	if state == Enum.UserInputState.Begin then
		Action:FireServer("Sprint", true)
	elseif state == Enum.UserInputState.End or state == Enum.UserInputState.Cancel then
		Action:FireServer("Sprint", false)
	end
	return Enum.ContextActionResult.Pass
end

local function simple(actionName: string)
	return function(_, state: Enum.UserInputState)
		if state == Enum.UserInputState.Begin then
			Action:FireServer(actionName)
		end
		return Enum.ContextActionResult.Pass
	end
end

local function rebind()
	for _, name in BOUND do
		ContextActionService:UnbindAction(name)
	end
	Action:FireServer("Sprint", false)
	local r = role()
	if r == "Survivor" then
		ContextActionService:BindAction("Correr", onSprint, true, Enum.KeyCode.LeftShift, Enum.KeyCode.RightShift, Enum.KeyCode.ButtonL3)
		ContextActionService:SetTitle("Correr", "Correr")
		ContextActionService:SetPosition("Correr", UDim2.new(1, -170, 1, -150))
		ContextActionService:BindAction("Lanterna", simple("Ability1"), true, Enum.KeyCode.Q, Enum.KeyCode.ButtonX)
		ContextActionService:SetTitle("Lanterna", "Luz")
		ContextActionService:SetPosition("Lanterna", UDim2.new(1, -230, 1, -90))
	elseif r == "Killer" then
		ContextActionService:BindAction("Atacar", simple("Attack"), true, Enum.UserInputType.MouseButton1, Enum.KeyCode.F, Enum.KeyCode.ButtonR2)
		ContextActionService:SetTitle("Atacar", "Golpe")
		ContextActionService:SetPosition("Atacar", UDim2.new(1, -170, 1, -150))
		ContextActionService:BindAction("Uivo", simple("Ability1"), true, Enum.KeyCode.Q, Enum.KeyCode.ButtonX)
		ContextActionService:SetTitle("Uivo", "Uivo")
		ContextActionService:SetPosition("Uivo", UDim2.new(1, -230, 1, -90))
		ContextActionService:BindAction("Investida", simple("Ability2"), true, Enum.KeyCode.E, Enum.KeyCode.ButtonY)
		ContextActionService:SetTitle("Investida", "Avanço")
		ContextActionService:SetPosition("Investida", UDim2.new(1, -110, 1, -210))
	end
end

player:GetAttributeChangedSignal("Role"):Connect(rebind)
rebind()

---------------------------------------------------------------------------------
-- Mensagens do servidor
---------------------------------------------------------------------------------
Remotes.get("Notify").OnClientEvent:Connect(function(text: string, color: Color3?)
	hud.toast(text, color)
end)

Remotes.get("Result").OnClientEvent:Connect(function(winner: string, title: string, sub: string)
	local color = if winner == "Killer" then Color3.fromRGB(220, 30, 24) else Color3.fromRGB(240, 220, 140)
	hud.showResult(title, sub, color)
end)

-- Uivo do assassino: destaca os sobreviventes através das paredes
Remotes.get("Reveal").OnClientEvent:Connect(function(targets: { Model }, duration: number)
	hud.toast("Você sente o cheiro do medo...", Color3.fromRGB(255, 80, 60))
	for _, model in targets do
		if typeof(model) == "Instance" and model:IsA("Model") then
			local h = Instance.new("Highlight")
			h.FillColor = Color3.fromRGB(255, 40, 30)
			h.OutlineColor = Color3.fromRGB(255, 200, 180)
			h.FillTransparency = 0.45
			h.DepthMode = Enum.HighlightDepthMode.AlwaysOnTop
			h.Parent = model
			task.delay(duration, function()
				h:Destroy()
			end)
		end
	end
end)

---------------------------------------------------------------------------------
-- Personagem: flash de dano e de atordoamento
---------------------------------------------------------------------------------
local function onCharacter(character: Model)
	local humanoid = character:WaitForChild("Humanoid") :: Humanoid
	local last = humanoid.Health
	humanoid.HealthChanged:Connect(function(hp)
		if hp < last - 1 then
			hud.hitFlash(Color3.fromRGB(180, 0, 0), 0.55)
		end
		last = hp
	end)
	character:GetAttributeChangedSignal("Stunned"):Connect(function()
		if character:GetAttribute("Stunned") then
			hud.hitFlash(Color3.fromRGB(255, 255, 240), 0.9)
		end
	end)
	local cam = workspace.CurrentCamera
	if cam then
		cam.CameraSubject = humanoid
	end
end
player.CharacterAdded:Connect(onCharacter)
if player.Character then
	task.spawn(onCharacter, player.Character)
end

---------------------------------------------------------------------------------
-- Assistir a partida (para quem está no lobby)
---------------------------------------------------------------------------------
local spectating: Player? = nil
local function spectateTargets(): { Player }
	local out = {}
	for _, p in Players:GetPlayers() do
		local r = p:GetAttribute("Role")
		if p ~= player and (r == "Survivor" or r == "Killer") and p.Character then
			table.insert(out, p)
		end
	end
	return out
end

local function stopSpectating()
	spectating = nil
	local char = player.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	if hum and workspace.CurrentCamera then
		workspace.CurrentCamera.CameraSubject = hum
	end
end

hud.spectate.MouseButton1Click:Connect(function()
	local list = spectateTargets()
	if #list == 0 then
		stopSpectating()
		return
	end
	local idx = table.find(list, spectating :: Player) or 0
	idx += 1
	if idx > #list then
		stopSpectating()
		return
	end
	spectating = list[idx]
	local hum = list[idx].Character and list[idx].Character:FindFirstChildOfClass("Humanoid")
	if hum and workspace.CurrentCamera then
		workspace.CurrentCamera.CameraSubject = hum
	end
end)

---------------------------------------------------------------------------------
-- Geradores: só sobreviventes veem o "Consertar"
---------------------------------------------------------------------------------
task.spawn(function()
	while true do
		local canRepair = role() == "Survivor"
		for _, prompt in CollectionService:GetTagged("GeneratorPrompt") do
			if prompt:IsA("ProximityPrompt") then
				local want = canRepair and not prompt:GetAttribute("Done")
				if prompt.Enabled ~= want then
					prompt.Enabled = want
				end
			end
		end
		task.wait(0.3)
	end
end)

---------------------------------------------------------------------------------
-- Luzes piscando (tag "Flicker") e pás do moinho girando (tag "Spin")
---------------------------------------------------------------------------------
local flickering: { [Instance]: boolean } = {}

local function setLit(part: BasePart, on: boolean)
	for _, l in part:GetChildren() do
		if l:IsA("Light") then
			l.Enabled = on
		end
	end
	if part.Material == Enum.Material.Neon or part:GetAttribute("WasNeon") then
		if not on then
			part:SetAttribute("WasNeon", true)
			part.Material = Enum.Material.SmoothPlastic
		else
			part.Material = Enum.Material.Neon
		end
	end
end

local function flicker(part: BasePart)
	if flickering[part] then
		return
	end
	flickering[part] = true
	task.spawn(function()
		for _ = 1, math.random(2, 5) do
			setLit(part, false)
			task.wait(math.random() * 0.12 + 0.03)
			setLit(part, true)
			task.wait(math.random() * 0.15 + 0.03)
		end
		if math.random() < 0.15 then
			setLit(part, false)
			task.wait(math.random() * 1.5 + 0.5)
			setLit(part, true)
		end
		flickering[part] = nil
	end)
end

task.spawn(function()
	while true do
		task.wait(0.1)
		for _, part in CollectionService:GetTagged("Flicker") do
			if part:IsA("BasePart") and math.random() < 0.012 then
				flicker(part)
			end
		end
	end
end)

RunService.RenderStepped:Connect(function(dt)
	for _, model in CollectionService:GetTagged("Spin") do
		if model:IsA("Model") then
			local speed = model:GetAttribute("Speed") or 0.5
			model:PivotTo(model:GetPivot() * CFrame.Angles(0, 0, speed * dt))
		end
	end
end)

---------------------------------------------------------------------------------
-- Sons opcionais (configure os IDs em Shared/Config)
---------------------------------------------------------------------------------
local function loopSound(id: string, volume: number): Sound?
	if id == "" then
		return nil
	end
	local s = Instance.new("Sound")
	s.SoundId = id
	s.Looped = true
	s.Volume = 0
	s.Parent = SoundService
	s:Play()
	s:SetAttribute("Target", volume)
	return s
end
local lobbyAmb = loopSound(Config.Sounds.LobbyAmbience, 0.4)
local roundAmb = loopSound(Config.Sounds.RoundAmbience, 0.4)
local chase = loopSound(Config.Sounds.Chase, 0.6)

local function fade(s: Sound?, target: number, dt: number)
	if s then
		s.Volume += (target - s.Volume) * math.min(1, dt * 2)
	end
end

---------------------------------------------------------------------------------
-- Atualização da interface
---------------------------------------------------------------------------------
local PHASE_TEXT = {
	Esperando = "AGUARDANDO",
	Votacao = "VOTAÇÃO DE MAPA",
	Preparando = "PREPARANDO",
	Partida = "PARTIDA",
	Fim = "FIM DA PARTIDA",
}

local function fmtTime(s: number): string
	s = math.max(0, math.floor(s))
	return ("%d:%02d"):format(s // 60, s % 60)
end

local function killerCharacter(): Model?
	for _, m in CollectionService:GetTagged("KillerCharacter") do
		if m:IsA("Model") and m.Parent then
			return m
		end
	end
	return nil
end

local function cooldownText(name: string, label: string, key: string, row)
	local cd = player:GetAttribute("CD_" .. name)
	local max = player:GetAttribute("CDMAX_" .. name) or 1
	local remaining = if cd then cd - workspace:GetServerTimeNow() else 0
	row.row.Visible = true
	if remaining > 0 then
		row.text.Text = ("[%s] %s — %.1fs"):format(key, label, remaining)
		row.fill.Size = UDim2.fromScale(math.clamp(remaining / max, 0, 1), 1)
		row.text.TextColor3 = Color3.fromRGB(170, 160, 150)
	else
		row.text.Text = ("[%s] %s — pronta"):format(key, label)
		row.fill.Size = UDim2.fromScale(0, 1)
		row.text.TextColor3 = Color3.fromRGB(250, 240, 220)
	end
end

local lastRole = ""
RunService.RenderStepped:Connect(function(dt)
	local phase = ReplicatedStorage:GetAttribute("Phase") or "Esperando"
	local timeLeft = ReplicatedStorage:GetAttribute("TimeLeft") or 0
	local r = role()

	local title = PHASE_TEXT[phase] or phase
	local mapName = ReplicatedStorage:GetAttribute("MapName") or ""
	if (phase == "Partida" or phase == "Preparando") and mapName ~= "" then
		title ..= " — " .. string.upper(mapName)
	end
	hud.phase.Text = title
	hud.timer.Text = if timeLeft > 0 then fmtTime(timeLeft) else ""
	hud.status.Text = ReplicatedStorage:GetAttribute("Status") or ""
	hud.timer.TextColor3 = if phase == "Votacao" and timeLeft <= 5 then Color3.fromRGB(255, 80, 60) else Color3.fromRGB(245, 235, 220)

	-- linha de informação
	if phase == "Votacao" or phase == "Esperando" then
		local vote = player:GetAttribute("Vote") or ""
		local myChance = player:GetAttribute("Chance") or 1
		local total = 0
		for _, p in Players:GetPlayers() do
			total += p:GetAttribute("Chance") or 1
		end
		local pct = if total > 0 then math.floor(myChance / total * 100 + 0.5) else 0
		local voteText = if vote ~= "" then "Seu voto: " .. vote else "Pise num quadrado para votar"
		hud.info.Text = ("%s   •   Chance de ser o Espantalho: %d%%"):format(voteText, pct)
	elseif phase == "Partida" then
		hud.info.Text = ("Geradores: %d/%d   •   Espantalho: %s"):format(
			ReplicatedStorage:GetAttribute("GensDone") or 0,
			ReplicatedStorage:GetAttribute("GensTotal") or 0,
			ReplicatedStorage:GetAttribute("Killer") or "?"
		)
	else
		hud.info.Text = ""
	end

	-- papel, vida, estamina
	local char = player.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	if r ~= lastRole then
		lastRole = r
		if r ~= "Lobby" then
			stopSpectating()
		end
	end
	if r == "Survivor" then
		hud.role.Text = "SOBREVIVENTE"
		hud.role.TextColor3 = Color3.fromRGB(230, 220, 200)
		hud.hpBack.Visible = true
		hud.stBack.Visible = true
		if hum then
			hud.hpFill.Size = UDim2.fromScale(math.clamp(hum.Health / math.max(hum.MaxHealth, 1), 0, 1), 1)
			hud.hpLabel.Text = ("Vida %d"):format(math.max(0, math.floor(hum.Health)))
		end
		local st = player:GetAttribute("Stamina") or Config.Survivor.MaxStamina
		hud.stFill.Size = UDim2.fromScale(math.clamp(st / Config.Survivor.MaxStamina, 0, 1), 1)
		hud.stLabel.Text = ("Estamina %d"):format(st)
		cooldownText("Lantern", "Lanterna", "Q", hud.abilityRows[1])
		hud.abilityRows[2].row.Visible = true
		hud.abilityRows[2].text.Text = "[Shift] Correr   [E] Consertar gerador"
		hud.abilityRows[2].fill.Size = UDim2.fromScale(0, 1)
		hud.abilityRows[3].row.Visible = false
	elseif r == "Killer" then
		hud.role.Text = "O ESPANTALHO"
		hud.role.TextColor3 = Color3.fromRGB(230, 40, 30)
		hud.hpBack.Visible = false
		hud.stBack.Visible = false
		cooldownText("Attack", "Golpe", "Clique/F", hud.abilityRows[1])
		cooldownText("Howl", "Uivo (revela todos)", "Q", hud.abilityRows[2])
		cooldownText("Dash", "Investida", "E", hud.abilityRows[3])
	else
		hud.role.Text = if phase == "Partida" then "ESPECTADOR" else "NO LOBBY"
		hud.role.TextColor3 = Color3.fromRGB(200, 190, 180)
		hud.hpBack.Visible = false
		hud.stBack.Visible = false
		for _, row in hud.abilityRows do
			row.row.Visible = false
		end
	end

	-- assistir
	hud.spectate.Visible = r == "Lobby" and phase == "Partida"
	if spectating then
		if not spectating.Parent or (spectating:GetAttribute("Role") ~= "Survivor" and spectating:GetAttribute("Role") ~= "Killer") or phase ~= "Partida" then
			stopSpectating()
		else
			hud.spectate.Text = "Assistindo: " .. spectating.DisplayName
		end
	else
		hud.spectate.Text = "Assistir partida"
	end

	-- raio de terror
	local terror = 0
	if r == "Survivor" and char then
		local root = char:FindFirstChild("HumanoidRootPart") :: BasePart?
		local killer = killerCharacter()
		local kroot = killer and killer:FindFirstChild("HumanoidRootPart") :: BasePart?
		if root and kroot then
			local d = (kroot.Position - root.Position).Magnitude
			if d < Config.TERROR_RADIUS then
				local closeness = 1 - d / Config.TERROR_RADIUS
				local beat = 0.55 + 0.45 * math.abs(math.sin(os.clock() * (3 + closeness * 6)))
				terror = closeness * beat
			end
		end
	end
	hud.setTerror(terror)

	fade(lobbyAmb, if phase ~= "Partida" or r == "Lobby" then 0.4 else 0, dt)
	fade(roundAmb, if phase == "Partida" and r ~= "Lobby" then 0.4 else 0, dt)
	fade(chase, if terror > 0.25 then 0.6 else 0, dt)
end)
