--!strict
-- Colheita Sombria — configurações gerais do jogo.
-- Ajuste os números aqui para balancear sem mexer no resto do código.

local Config = {}

Config.GAME_NAME = "Colheita Sombria"
Config.KILLER_NAME = "O Espantalho"

-- Ciclo de partida -------------------------------------------------------
Config.INTERMISSION_TIME = 30 -- segundos de votação entre as partidas
Config.ROUND_TIME = 180 -- duração máxima de uma partida
Config.KILLER_RELEASE_DELAY = 8 -- segundos que o assassino fica preso no início
Config.RESULT_TIME = 7 -- tempo mostrando o resultado antes de voltar ao lobby
Config.RESPAWN_TIME = 3
Config.MIN_PLAYERS_FOR_PVP = 2 -- com menos que isso o assassino vira um bot
Config.SOLO_BOT = true -- permite jogar sozinho contra um Espantalho controlado pelo computador
Config.VOTE_OPTIONS = 4 -- quantos quadrados de votação existem no lobby

-- Posições no mundo --------------------------------------------------------
Config.LOBBY_CENTER = Vector3.new(0, 0, 0)
Config.MAP_CENTER = Vector3.new(0, 0, 4000)

-- Sobreviventes ----------------------------------------------------------
Config.Survivor = {
	Health = 100,
	WalkSpeed = 12,
	SprintSpeed = 24,
	HurtBoostSpeed = 28, -- velocidade extra logo depois de levar um golpe
	HurtBoostTime = 1.6,
	MaxStamina = 100,
	StaminaDrain = 14, -- por segundo correndo
	StaminaRegen = 18, -- por segundo descansando
	RegenDelay = 1.2,
	LanternCooldown = 28,
	LanternRange = 22,
	LanternStun = 2.5,
}

-- Assassino ----------------------------------------------------------------
Config.Killer = {
	WalkSpeed = 19,
	AttackDamage = 30,
	AttackCooldown = 1.4,
	AttackRange = 8,
	DashSpeed = 34,
	DashTime = 1.4,
	DashCooldown = 15,
	HowlCooldown = 30,
	HowlDuration = 5,
}

-- Geradores (objetivo dos sobreviventes) ----------------------------------
Config.Generator = {
	Count = 5,
	StepPercent = 20, -- cada "segurar E" conserta essa porcentagem
	HoldDuration = 1.6,
	TimeReduction = 20, -- segundos tirados do relógio a cada gerador consertado
}

-- Distância em que os sobreviventes sentem o "raio de terror"
Config.TERROR_RADIUS = 55

-- Sons (opcional). Coloque IDs de áudio do seu inventário, ex: "rbxassetid://123".
-- Deixe "" para desativar.
Config.Sounds = {
	LobbyAmbience = "",
	RoundAmbience = "",
	Chase = "",
	Attack = "rbxasset://sounds/swordslash.wav",
	GeneratorDone = "rbxasset://sounds/electronicpingshort.wav",
}

return Config
