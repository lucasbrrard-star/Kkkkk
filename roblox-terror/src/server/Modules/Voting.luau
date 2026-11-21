-- Voting: o jogador vota pisando num dos 4 quadrados do lobby.
-- O voto fica valendo até ele pisar em outro quadrado.

local Players = game:GetService("Players")

local Voting = {}

local pads = {}
local options = {}
local votes: { [Player]: number } = {}
local active = false
local loopThread: thread? = nil

local NEUTRAL = Color3.fromRGB(70, 70, 70)

function Voting.setup(lobbyPads)
	pads = lobbyPads
	Voting.showIdle("Aguarde a próxima votação...")
end

local function padUnder(character: Model): number?
	local root = character:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not root then
		return nil
	end
	local pos = root.Position
	for _, pad in pads do
		local c = pad.center
		if math.abs(pos.X - c.X) <= pad.half and math.abs(pos.Z - c.Z) <= pad.half and pos.Y > c.Y - 1 and pos.Y < c.Y + 9 then
			return pad.index
		end
	end
	return nil
end

local function counts(): { number }
	local out = {}
	for i = 1, #pads do
		out[i] = 0
	end
	for player, index in votes do
		if player.Parent and out[index] then
			out[index] += 1
		end
	end
	return out
end

local function refresh()
	local c = counts()
	for i, pad in pads do
		local n = c[i] or 0
		pad.votes.Text = if n == 1 then "1 voto" else n .. " votos"
		pad.glow.Transparency = if n > 0 then 0.25 else 0.55
	end
end

function Voting.showIdle(text: string)
	for _, pad in pads do
		pad.title.Text = "..."
		pad.desc.Text = text
		pad.votes.Text = ""
		pad.bar.BackgroundColor3 = NEUTRAL
		pad.glow.Color = NEUTRAL
		pad.glow.Transparency = 0.7
		for _, b in pad.borders do
			b.Color = NEUTRAL
		end
		local light = pad.glow:FindFirstChildOfClass("PointLight")
		if light then
			light.Color = NEUTRAL
		end
	end
end

-- Começa uma votação com a lista de mapas (um por quadrado)
function Voting.start(mapOptions)
	options = mapOptions
	table.clear(votes)
	for i, pad in pads do
		local def = options[i]
		if def then
			pad.title.Text = def.name
			pad.desc.Text = def.desc
			pad.bar.BackgroundColor3 = def.color
			pad.glow.Color = def.color
			for _, b in pad.borders do
				b.Color = def.color
			end
			local light = pad.glow:FindFirstChildOfClass("PointLight")
			if light then
				light.Color = def.color
			end
		end
	end
	for _, player in Players:GetPlayers() do
		player:SetAttribute("Vote", "")
	end
	active = true
	refresh()
	loopThread = task.spawn(function()
		while active do
			local changed = false
			for _, player in Players:GetPlayers() do
				local char = player.Character
				if char then
					local index = padUnder(char)
					if index and options[index] and votes[player] ~= index then
						votes[player] = index
						player:SetAttribute("Vote", options[index].name)
						changed = true
					end
				end
			end
			for player in votes do
				if not player.Parent then
					votes[player] = nil
					changed = true
				end
			end
			if changed then
				refresh()
			end
			task.wait(0.2)
		end
	end)
end

-- Termina a votação e devolve o mapa vencedor (empate = sorteio)
function Voting.stop()
	active = false
	if loopThread and coroutine.status(loopThread) == "suspended" then
		task.cancel(loopThread)
	end
	loopThread = nil
	local c = counts()
	local best, winners = -1, {}
	for i = 1, #options do
		local n = c[i] or 0
		if n > best then
			best = n
			winners = { i }
		elseif n == best then
			table.insert(winners, i)
		end
	end
	local index = winners[math.random(1, #winners)]
	for _, player in Players:GetPlayers() do
		player:SetAttribute("Vote", "")
	end
	-- destaca o vencedor
	for i, pad in pads do
		pad.glow.Transparency = if i == index then 0 else 0.8
	end
	return options[index], best
end

return Voting
