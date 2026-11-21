-- Colheita Sombria — script principal do servidor.
-- Monta o lobby, cuida dos jogadores e inicia o ciclo de partidas.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

-- Personagens só nascem depois que o lobby estiver pronto
Players.CharacterAutoLoads = false
-- Shift é usado para correr, então desligamos o "Shift Lock"
pcall(function()
	game:GetService("StarterPlayer").EnableMouseLockOption = false
end)

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
require(Shared:WaitForChild("Remotes")) -- cria os RemoteEvents

local Modules = script.Parent:WaitForChild("Modules")
local Atmosphere = require(Modules.Atmosphere)
local Lobby = require(Modules.Lobby)
local RoundManager = require(Modules.RoundManager)
local Voting = require(Modules.Voting)

Atmosphere.apply("Lobby", true)
local lobby = Lobby.build()
Voting.setup(lobby.pads)
ReplicatedStorage:SetAttribute("LobbyReady", true)

local function setupPlayer(player: Player)
	local stats = Instance.new("Folder")
	stats.Name = "leaderstats"
	stats.Parent = player
	local wins = Instance.new("IntValue")
	wins.Name = "Vitorias"
	wins.Parent = stats

	player:SetAttribute("Role", "Lobby")
	player:SetAttribute("Chance", 1)
	player:SetAttribute("Vote", "")

	player.CharacterAdded:Connect(function(character)
		player:SetAttribute("Role", "Lobby")
		local humanoid = character:WaitForChild("Humanoid") :: Humanoid
		humanoid.Died:Connect(function()
			task.delay(Config.RESPAWN_TIME, function()
				-- só renasce se ainda for o mesmo personagem (evita renascer duas vezes)
				if player.Parent and player.Character == character then
					player:LoadCharacter()
				end
			end)
		end)
	end)
	player:LoadCharacter()
end

Players.PlayerAdded:Connect(setupPlayer)
for _, p in Players:GetPlayers() do
	task.spawn(setupPlayer, p)
end

RoundManager.run()
