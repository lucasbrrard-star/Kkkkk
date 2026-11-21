--!strict
-- Cria (no servidor) ou espera (no cliente) os RemoteEvents do jogo.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local NAMES = {
	"Action", -- cliente -> servidor: ações do jogador (correr, atacar, habilidades)
	"Notify", -- servidor -> cliente: mensagens rápidas na tela
	"Reveal", -- servidor -> assassino: destacar sobreviventes
	"Result", -- servidor -> todos: resultado da partida
}

local folder: Instance
if RunService:IsServer() then
	local existing = ReplicatedStorage:FindFirstChild("Remotes")
	if existing then
		folder = existing
	else
		folder = Instance.new("Folder")
		folder.Name = "Remotes"
		folder.Parent = ReplicatedStorage
	end
	for _, name in NAMES do
		if not folder:FindFirstChild(name) then
			local remote = Instance.new("RemoteEvent")
			remote.Name = name
			remote.Parent = folder
		end
	end
else
	folder = ReplicatedStorage:WaitForChild("Remotes")
end

local Remotes = {}

function Remotes.get(name: string): RemoteEvent
	return folder:WaitForChild(name) :: RemoteEvent
end

return Remotes
