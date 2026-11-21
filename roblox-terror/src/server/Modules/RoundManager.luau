-- RoundManager: o ciclo do jogo.
--   1) Votação no lobby (30 s) nos 4 quadrados
--   2) Sorteio do assassino (quem não foi assassino ganha mais chance)
--   3) Partida no mapa escolhido
--   4) Resultado e volta ao lobby -> repete

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Modules = script.Parent
local Atmosphere = require(Modules.Atmosphere)
local Generators = require(Modules.Generators)
local KillerBot = require(Modules.KillerBot)
local Maps = require(Modules.Maps)
local Roles = require(Modules.Roles)
local Voting = require(Modules.Voting)

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local Remotes = require(Shared:WaitForChild("Remotes"))

local Notify = Remotes.get("Notify")
local ResultRemote = Remotes.get("Result")

local RoundManager = {}

-- o que precisa ser limpo se algo der errado no meio da partida
local current: { destroyMap: (() -> ())?, bot: Model? } = { destroyMap = nil, bot = nil }

local function cleanupWorld()
	if current.bot then
		current.bot:Destroy()
		current.bot = nil
	end
	if current.destroyMap then
		current.destroyMap()
		current.destroyMap = nil
	end
end

-- Estado visível para os clientes (atributos no ReplicatedStorage)
local function set(name: string, value: any)
	ReplicatedStorage:SetAttribute(name, value)
end

local function status(text: string)
	set("Status", text)
end

local function broadcast(text: string, color: Color3?)
	for _, p in Players:GetPlayers() do
		Notify:FireClient(p, text, color)
	end
end

local function aliveCharacter(player: Player): Model?
	local char = player.Character
	if not char or not char.Parent then
		return nil
	end
	local hum = char:FindFirstChildOfClass("Humanoid")
	local root = char:FindFirstChild("HumanoidRootPart")
	if hum and root and hum.Health > 0 then
		return char
	end
	return nil
end

local function requiredPlayers(): number
	return if Config.SOLO_BOT then 1 else Config.MIN_PLAYERS_FOR_PVP
end

-- Sorteio com peso: cada partida sem ser assassino aumenta a chance
local function pickKiller(candidates: { Player }): Player
	local total = 0
	for _, p in candidates do
		total += math.max(0, p:GetAttribute("Chance") or 1)
	end
	if total <= 0 then
		return candidates[math.random(1, #candidates)]
	end
	local roll = math.random() * total
	for _, p in candidates do
		roll -= math.max(0, p:GetAttribute("Chance") or 1)
		if roll <= 0 then
			return p
		end
	end
	return candidates[#candidates]
end

local function teleport(player: Player?, character: Model, position: Vector3)
	if player then
		pcall(function()
			player:RequestStreamAroundAsync(position, 5)
		end)
	end
	local root = character:FindFirstChild("HumanoidRootPart") :: BasePart?
	if root then
		root.AssemblyLinearVelocity = Vector3.zero
	end
	character:PivotTo(CFrame.new(position + Vector3.new(0, 3, 0)) * CFrame.Angles(0, math.random() * math.pi * 2, 0))
end

local function addWin(player: Player)
	local stats = player:FindFirstChild("leaderstats")
	local wins = stats and stats:FindFirstChild("Vitorias")
	if wins and wins:IsA("IntValue") then
		wins.Value += 1
	end
end

---------------------------------------------------------------------------------
-- 1) Intervalo / votação
---------------------------------------------------------------------------------
local function intermission()
	Atmosphere.apply("Lobby")
	-- espera ter gente suficiente
	while #Players:GetPlayers() < requiredPlayers() do
		set("Phase", "Esperando")
		set("TimeLeft", 0)
		status("Aguardando jogadores...")
		Voting.showIdle("Aguardando jogadores...")
		task.wait(1)
	end

	local options = Maps.randomOptions(Config.VOTE_OPTIONS)
	Voting.start(options)
	set("Phase", "Votacao")
	status("Pise num quadrado para votar no próximo mapa!")
	for t = Config.INTERMISSION_TIME, 1, -1 do
		set("TimeLeft", t)
		task.wait(1)
	end
	set("TimeLeft", 0)
	local def, votes = Voting.stop()
	set("MapName", def.name)
	status(("Mapa escolhido: %s (%d votos)"):format(def.name, math.max(votes, 0)))
	broadcast("Mapa escolhido: " .. def.name, def.color)
	task.wait(3)
	return def
end

---------------------------------------------------------------------------------
-- 2/3) Partida
---------------------------------------------------------------------------------
local function playRound(def)
	set("Phase", "Preparando")
	status("Preparando " .. def.name .. "...")

	-- quem vai jogar: todo mundo vivo no lobby
	local participants: { Player } = {}
	for _, p in Players:GetPlayers() do
		if aliveCharacter(p) then
			table.insert(participants, p)
		end
	end
	if #participants == 0 then
		return
	end
	local useBot = #participants < Config.MIN_PLAYERS_FOR_PVP
	if useBot and not Config.SOLO_BOT then
		status("Jogadores insuficientes.")
		task.wait(2)
		return
	end

	local loaded = Maps.load(def, math.random(1, 1e6))
	current.destroyMap = loaded.destroy
	Atmosphere.apply(def.lighting)
	local info = loaded.info

	-- escolhe o assassino
	local killerPlayer: Player? = nil
	if not useBot then
		killerPlayer = pickKiller(participants)
	end
	for _, p in participants do
		if p == killerPlayer then
			p:SetAttribute("Chance", 0)
		else
			p:SetAttribute("Chance", (p:GetAttribute("Chance") or 1) + 1)
		end
	end

	-- coloca todos no mapa
	local survivorsAtStart: { Player } = {}
	local spawnIndex = 0
	for _, p in participants do
		local char = aliveCharacter(p)
		if char then
			if p == killerPlayer then
				teleport(p, char, info.killerSpawn)
				Roles.makeKiller(char, p)
			else
				spawnIndex += 1
				local pos = info.survivorSpawns[(spawnIndex - 1) % #info.survivorSpawns + 1]
				teleport(p, char, pos)
				if Roles.makeSurvivor(p) then
					table.insert(survivorsAtStart, p)
				end
			end
		end
	end
	local bot: Model? = nil
	if useBot then
		bot = KillerBot.spawn(info.killerSpawn)
		current.bot = bot
	end
	local killerName = if killerPlayer then killerPlayer.DisplayName else "Bot"
	set("Killer", killerName)

	-- geradores
	local roundTime = Config.ROUND_TIME
	local timeLeft = roundTime
	local gens = Generators.spawn(loaded.model, info.generators, function(_gen, player, doneCount)
		timeLeft = math.max(10, timeLeft - Config.Generator.TimeReduction)
		set("GensDone", doneCount)
		broadcast(("%s consertou um gerador! (%d/%d) -%ds"):format(player.DisplayName, doneCount, #info.generators, Config.Generator.TimeReduction), Color3.fromRGB(120, 255, 120))
	end)
	set("GensDone", 0)
	set("GensTotal", gens.total)

	-- mortes
	local deaths = 0
	Roles.onSurvivorDied = function(player: Player?, _character: Model)
		deaths += 1
		if player then
			broadcast(player.DisplayName .. " foi pego pelo Espantalho...", Color3.fromRGB(255, 60, 50))
		end
	end

	-- assassino preso no começo
	Roles.freezeKiller(Config.KILLER_RELEASE_DELAY)
	set("Phase", "Partida")
	for t = Config.KILLER_RELEASE_DELAY, 1, -1 do
		status(("O Espantalho desperta em %d..."):format(t))
		set("TimeLeft", math.ceil(timeLeft))
		task.wait(1)
	end
	broadcast("O ESPANTALHO DESPERTOU!", Color3.fromRGB(255, 40, 30))
	status("Sobreviva! Conserte os geradores para acelerar o relógio.")

	-- loop da partida
	local winner: string? = nil
	local last = os.clock()
	while true do
		task.wait(0.25)
		local t = os.clock()
		timeLeft -= (t - last)
		last = t
		set("TimeLeft", math.max(0, math.ceil(timeLeft)))

		local aliveSurvivors = #Roles.survivors()
		local killer = Roles.getKiller()
		if aliveSurvivors == 0 then
			winner = "Killer"
			break
		end
		if not killer then
			winner = "Survivors"
			break
		end
		if timeLeft <= 0 then
			winner = "Survivors"
			break
		end
	end

	-- 4) resultado
	set("Phase", "Fim")
	set("TimeLeft", 0)
	local survivorsAlive = {}
	for _, s in Roles.survivors() do
		if s.player then
			table.insert(survivorsAlive, s.player)
		end
	end
	local title, subtitle
	if winner == "Killer" then
		title = "O ESPANTALHO VENCEU"
		subtitle = "Ninguém escapou da colheita."
		if killerPlayer and killerPlayer.Parent then
			addWin(killerPlayer)
		end
	else
		title = "OS SOBREVIVENTES VENCERAM"
		local names = {}
		for _, p in survivorsAlive do
			addWin(p)
			table.insert(names, p.DisplayName)
		end
		subtitle = if #names > 0 then "Sobreviveram: " .. table.concat(names, ", ") else "O Espantalho fugiu."
	end
	status(title)
	for _, p in Players:GetPlayers() do
		ResultRemote:FireClient(p, winner, title, subtitle)
	end
	task.wait(Config.RESULT_TIME)

	-- limpa tudo e volta ao lobby
	Roles.onSurvivorDied = nil
	Roles.reset()
	for _, p in Players:GetPlayers() do
		local char = p.Character
		local root = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
		-- quem ainda está no mapa renasce no lobby
		if root and (root.Position - Config.MAP_CENTER).Magnitude < 600 then
			p:LoadCharacter()
		end
	end
	cleanupWorld()
	set("Killer", "")
	set("MapName", "")
	set("GensDone", 0)
	set("GensTotal", 0)
end

function RoundManager.run()
	set("Phase", "Esperando")
	set("TimeLeft", 0)
	set("Status", "")
	while true do
		local ok, err = pcall(function()
			local def = intermission()
			playRound(def)
		end)
		if not ok then
			warn("[RoundManager] erro na partida:", err)
			Roles.onSurvivorDied = nil
			Roles.reset()
			cleanupWorld()
			for _, p in Players:GetPlayers() do
				if p.Character then
					p:LoadCharacter()
				end
			end
			task.wait(2)
		end
	end
end

return RoundManager
