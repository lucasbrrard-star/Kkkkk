-- Lobby: o cercado de grades onde os jogadores nascem, com paredes invisíveis,
-- os 4 quadrados de votação e o cenário de fazenda em volta (só decoração).

local Build = require(script.Parent.Build)
local Config = require(game:GetService("ReplicatedStorage"):WaitForChild("Shared"):WaitForChild("Config"))

local C = Build.Colors
local Lobby = {}

export type Pad = {
	index: number,
	part: BasePart,
	center: Vector3,
	half: number,
	borders: { BasePart },
	glow: BasePart,
	title: TextLabel,
	desc: TextLabel,
	votes: TextLabel,
	bar: Frame,
}

local CAGE_W = 72 -- largura (X)
local CAGE_D = 60 -- profundidade (Z)

local function makePad(parent: Instance, index: number, pos: Vector3): Pad
	local model = Build.model("Votacao" .. index, parent)
	local size = 12
	local base = Build.box(model, Vector3.new(size, 0.6, size), CFrame.new(pos + Vector3.new(0, 0.3, 0)), Color3.fromRGB(30, 28, 32), Enum.Material.Slate)
	base.Name = "Quadrado"
	local glow = Build.box(model, Vector3.new(size - 2, 0.1, size - 2), CFrame.new(pos + Vector3.new(0, 0.62, 0)), Color3.fromRGB(80, 80, 80), Enum.Material.Neon, {
		Transparency = 0.55,
		CanCollide = false,
		CastShadow = false,
	})
	local borders = {}
	for _, data in {
		{ Vector3.new(size, 0.3, 0.5), Vector3.new(0, 0.75, -size / 2 + 0.25) },
		{ Vector3.new(size, 0.3, 0.5), Vector3.new(0, 0.75, size / 2 - 0.25) },
		{ Vector3.new(0.5, 0.3, size), Vector3.new(-size / 2 + 0.25, 0.75, 0) },
		{ Vector3.new(0.5, 0.3, size), Vector3.new(size / 2 - 0.25, 0.75, 0) },
	} do
		local b = Build.box(model, data[1], CFrame.new(pos + data[2]), Color3.fromRGB(120, 120, 120), Enum.Material.Neon, { CastShadow = false })
		table.insert(borders, b)
	end
	local light = Build.light(glow, Color3.fromRGB(200, 200, 200), 14, 1)
	light.Name = "Luz"

	-- Placa com o nome do mapa (de frente para o spawn)
	local boardPos = pos + Vector3.new(0, 0, 8)
	for _, x in { -5.2, 5.2 } do
		Build.box(model, Vector3.new(0.6, 10, 0.6), CFrame.new(boardPos + Vector3.new(x, 5, 0.4)), C.DarkWood, Enum.Material.Wood)
	end
	local board = Build.box(model, Vector3.new(11.4, 6.5, 0.4), CFrame.new(boardPos + Vector3.new(0, 6.2, 0)), Color3.fromRGB(34, 26, 22), Enum.Material.WoodPlanks)
	local gui = Instance.new("SurfaceGui")
	gui.Face = Enum.NormalId.Front
	gui.CanvasSize = Vector2.new(570, 325)
	gui.LightInfluence = 0.2
	gui.Parent = board

	local bar = Instance.new("Frame")
	bar.Size = UDim2.new(1, 0, 0, 14)
	bar.BorderSizePixel = 0
	bar.BackgroundColor3 = Color3.fromRGB(120, 120, 120)
	bar.Parent = gui

	local title = Instance.new("TextLabel")
	title.Position = UDim2.new(0, 16, 0, 24)
	title.Size = UDim2.new(1, -32, 0, 90)
	title.BackgroundTransparency = 1
	title.Font = Enum.Font.Creepster
	title.TextScaled = true
	title.TextColor3 = Color3.fromRGB(235, 225, 210)
	title.Text = "..."
	title.Parent = gui

	local desc = Instance.new("TextLabel")
	desc.Position = UDim2.new(0, 20, 0, 118)
	desc.Size = UDim2.new(1, -40, 0, 90)
	desc.BackgroundTransparency = 1
	desc.Font = Enum.Font.Gotham
	desc.TextWrapped = true
	desc.TextSize = 26
	desc.TextColor3 = Color3.fromRGB(190, 180, 170)
	desc.Text = ""
	desc.Parent = gui

	local votes = Instance.new("TextLabel")
	votes.Position = UDim2.new(0, 16, 1, -100)
	votes.Size = UDim2.new(1, -32, 0, 86)
	votes.BackgroundTransparency = 1
	votes.Font = Enum.Font.GothamBlack
	votes.TextScaled = true
	votes.TextColor3 = Color3.fromRGB(255, 255, 255)
	votes.Text = "0 votos"
	votes.Parent = gui

	return {
		index = index,
		part = base,
		center = pos,
		half = size / 2,
		borders = borders,
		glow = glow,
		title = title,
		desc = desc,
		votes = votes,
		bar = bar,
	}
end

-- Cenário de fazenda do lado de fora (decoração, ninguém chega lá)
local function buildFarmland(root: Instance, c: Vector3)
	local rng = Random.new(1337)
	local farm = Build.model("Fazendas", root)
	local terrain = workspace.Terrain

	-- Estradas de terra
	terrain:FillBlock(CFrame.new(c + Vector3.new(0, -2, -58)), Vector3.new(900, 4.2, 14), Enum.Material.Ground)
	terrain:FillBlock(CFrame.new(c + Vector3.new(0, -2, -44)), Vector3.new(10, 4.2, 30), Enum.Material.Ground)
	terrain:FillBlock(CFrame.new(c + Vector3.new(-52, -2, 60)), Vector3.new(12, 4.2, 360), Enum.Material.Ground)

	-- NORTE (à frente do jogador): campo de trigo, celeiro, silos e moinho
	terrain:FillBlock(CFrame.new(c + Vector3.new(0, -2, 90)), Vector3.new(84, 4.2, 70), Enum.Material.Mud)
	Build.crops(farm, CFrame.new(c + Vector3.new(0, 0, 90)), 80, 66, "wheat")
	Build.fence(farm, c + Vector3.new(-43, 0, 54), c + Vector3.new(43, 0, 54))
	Build.fence(farm, c + Vector3.new(-43, 0, 126), c + Vector3.new(43, 0, 126))
	Build.fence(farm, c + Vector3.new(43, 0, 54), c + Vector3.new(43, 0, 126))
	Build.scarecrow(farm, CFrame.new(c + Vector3.new(-12, 0, 84)) * CFrame.Angles(0, math.rad(180), 0))
	Build.scarecrow(farm, CFrame.new(c + Vector3.new(20, 0, 104)) * CFrame.Angles(0, math.rad(200), 0))

	Build.barn(farm, CFrame.new(c + Vector3.new(85, 0, 160)) * CFrame.Angles(0, math.rad(200), 0), 34, 44, 18)
	Build.silo(farm, c + Vector3.new(116, 0, 140), 11, 30)
	Build.silo(farm, c + Vector3.new(124, 0, 160), 9, 24)
	Build.windmill(farm, c + Vector3.new(-95, 0, 175), Vector3.new(0.4, 0, -1))
	for i = 0, 5 do
		Build.haybale(farm, CFrame.new(c + Vector3.new(60 + i * 6, 0, 120 + (i % 2) * 5)) * CFrame.Angles(0, rng:NextNumber(0, 3), 0), i % 3 == 0)
	end
	Build.lamp(farm, c + Vector3.new(62, 0, 138))

	-- OESTE: casa da fazenda, trator, poço e plantação de abóboras
	Build.building(farm, CFrame.new(c + Vector3.new(-120, 0, 10)) * CFrame.Angles(0, math.rad(-90), 0), 30, 24, 13, {
		name = "CasaDaFazenda",
		wallColor = Color3.fromRGB(150, 140, 120),
		roofColor = Color3.fromRGB(50, 40, 36),
		trim = C.Trim,
		litWindows = true,
		doors = { front = true },
	})
	Build.fence(farm, c + Vector3.new(-90, 0, -30), c + Vector3.new(-90, 0, 50))
	Build.tractor(farm, CFrame.new(c + Vector3.new(-78, 0, 34)) * CFrame.Angles(0, math.rad(30), 0))
	Build.well(farm, c + Vector3.new(-100, 0, 44))
	Build.lamp(farm, c + Vector3.new(-96, 0, 2))
	terrain:FillBlock(CFrame.new(c + Vector3.new(-72, -2, -28)), Vector3.new(30, 4.2, 30), Enum.Material.Mud)
	for _ = 1, 22 do
		local p = c + Vector3.new(-72 + rng:NextNumber(-13, 13), 0, -28 + rng:NextNumber(-13, 13))
		Build.pumpkin(farm, p, rng:NextNumber() < 0.35, rng:NextNumber(0.8, 1.4))
	end
	Build.cart(farm, CFrame.new(c + Vector3.new(-60, 0, 12)) * CFrame.Angles(0, math.rad(70), 0))

	-- LESTE: milharal, espantalhos e um galpão
	terrain:FillBlock(CFrame.new(c + Vector3.new(125, -2, 0)), Vector3.new(110, 4.2, 150), Enum.Material.Mud)
	Build.crops(farm, CFrame.new(c + Vector3.new(125, 0, 0)), 104, 144, "corn")
	Build.scarecrow(farm, CFrame.new(c + Vector3.new(76, 0, -10)) * CFrame.Angles(0, math.rad(-90), 0))
	Build.fence(farm, c + Vector3.new(68, 0, -78), c + Vector3.new(68, 0, 78))
	Build.building(farm, CFrame.new(c + Vector3.new(120, 0, -110)) * CFrame.Angles(0, math.rad(160), 0), 18, 14, 9, {
		name = "Galpao",
		wallColor = Color3.fromRGB(90, 80, 70),
		roofColor = Color3.fromRGB(60, 56, 54),
		roofMat = Enum.Material.CorrodedMetal,
		doors = { front = true },
	})

	-- SUL (atrás do spawn): pomar morto e uma capela distante com túmulos
	for _ = 1, 26 do
		local p = c + Vector3.new(rng:NextNumber(-140, 140), 0, rng:NextNumber(-170, -80))
		Build.tree(farm, p, rng, "dead")
	end
	Build.building(farm, CFrame.new(c + Vector3.new(30, 0, -230)) * CFrame.Angles(0, math.rad(10), 0), 20, 30, 14, {
		name = "Capela",
		wallColor = Color3.fromRGB(110, 106, 104),
		wallMat = Enum.Material.Brick,
		roofColor = Color3.fromRGB(40, 36, 38),
		roofH = 10,
	})
	for i = 0, 10 do
		Build.tombstone(farm, CFrame.new(c + Vector3.new(-10 + (i % 6) * 5, 0, -200 - math.floor(i / 6) * 9)), rng)
	end

	-- Fileira de árvores no horizonte
	for i = 1, 70 do
		local a = (i / 70) * math.pi * 2 + rng:NextNumber(-0.04, 0.04)
		local r = rng:NextNumber(250, 330)
		Build.tree(farm, c + Vector3.new(math.cos(a) * r, 0, math.sin(a) * r), rng, if i % 3 == 0 then "pine" else nil)
	end
	-- Árvores soltas e pedras
	for _ = 1, 25 do
		local p = c + Vector3.new(rng:NextNumber(-220, 220), 0, rng:NextNumber(-220, 220))
		if math.abs(p.X - c.X) > 70 or math.abs(p.Z - c.Z) > 130 then
			if rng:NextNumber() < 0.6 then
				Build.tree(farm, p, rng)
			else
				Build.rock(farm, p, rng)
			end
		end
	end
end

function Lobby.build()
	local c = Config.LOBBY_CENTER
	local root = Build.model("Lobby", workspace)

	-- Chão de grama (Terrain) bem grande
	workspace.Terrain:FillBlock(CFrame.new(c + Vector3.new(0, -4, 0)), Vector3.new(1000, 8, 1000), Enum.Material.Grass)

	-- Piso de pedra do cercado
	Build.box(root, Vector3.new(CAGE_W, 1, CAGE_D), CFrame.new(c + Vector3.new(0, 0.5, 0)), Color3.fromRGB(70, 68, 72), Enum.Material.Cobblestone)
	Build.box(root, Vector3.new(CAGE_W + 3, 0.6, CAGE_D + 3), CFrame.new(c + Vector3.new(0, 0.3, 0)), Color3.fromRGB(50, 48, 52), Enum.Material.Slate)

	-- Grades em volta
	local cage = Build.model("Cercado", root)
	local x0, x1 = c.X - CAGE_W / 2, c.X + CAGE_W / 2
	local z0, z1 = c.Z - CAGE_D / 2, c.Z + CAGE_D / 2
	local y = c.Y + 1
	Build.bars(cage, Vector3.new(x0, y, z0), Vector3.new(x1, y, z0), 14)
	Build.bars(cage, Vector3.new(x0, y, z1), Vector3.new(x1, y, z1), 14)
	Build.bars(cage, Vector3.new(x0, y, z0), Vector3.new(x0, y, z1), 14)
	Build.bars(cage, Vector3.new(x1, y, z0), Vector3.new(x1, y, z1), 14)

	-- Pilares de pedra com lanternas nos cantos
	for _, px in { x0, x1 } do
		for _, pz in { z0, z1 } do
			Build.box(cage, Vector3.new(3, 17, 3), CFrame.new(px, y + 8.5, pz), C.DarkStone, Enum.Material.Cobblestone)
			Build.box(cage, Vector3.new(3.6, 0.8, 3.6), CFrame.new(px, y + 17.4, pz), C.Stone, Enum.Material.Slate)
			local lantern = Build.box(cage, Vector3.new(1.4, 1.8, 1.4), CFrame.new(px, y + 18.7, pz), C.LampLight, Enum.Material.Neon)
			Build.light(lantern, C.LampLight, 30, 1.4, true)
		end
	end

	-- Portão trancado (atrás do spawn)
	local gate = Build.model("Portao", cage)
	Build.box(gate, Vector3.new(0.8, 16, 0.8), CFrame.new(c.X - 5, y + 8, z0 - 0.2), C.Iron, Enum.Material.CorrodedMetal)
	Build.box(gate, Vector3.new(0.8, 16, 0.8), CFrame.new(c.X + 5, y + 8, z0 - 0.2), C.Iron, Enum.Material.CorrodedMetal)
	Build.box(gate, Vector3.new(10.8, 0.8, 0.8), CFrame.new(c.X, y + 15.6, z0 - 0.2), C.Iron, Enum.Material.CorrodedMetal)
	Build.box(gate, Vector3.new(1.4, 1.6, 0.8), CFrame.new(c.X, y + 6, z0 - 0.6), Color3.fromRGB(90, 70, 40), Enum.Material.Metal)
	for i = -4, 4 do
		Build.box(gate, Vector3.new(0.5, 0.25, 0.25), CFrame.new(c.X + i * 0.5, y + 6.6 + math.abs(i) * 0.25, z0 - 0.5) * CFrame.Angles(0, 0, i * 0.3), Color3.fromRGB(70, 70, 76), Enum.Material.Metal)
	end

	-- PAREDES INVISÍVEIS: o jogador não consegue sair nem pular por cima da grade
	Build.invisibleBox(root, Vector3.new(c.X, c.Y, c.Z), CAGE_W - 1, CAGE_D - 1, 120)

	-- Spawn (o jogador nasce olhando para os quadrados de votação, em +Z)
	local spawnPos = c + Vector3.new(0, 1.1, -16)
	local spawn = Instance.new("SpawnLocation")
	spawn.Name = "SpawnLobby"
	spawn.Anchored = true
	spawn.Neutral = true
	spawn.Duration = 0
	spawn.Size = Vector3.new(10, 0.2, 10)
	spawn.CFrame = CFrame.new(spawnPos) * CFrame.Angles(0, math.pi, 0)
	spawn.Color = Color3.fromRGB(40, 20, 20)
	spawn.Material = Enum.Material.Slate
	spawn.TopSurface = Enum.SurfaceType.Smooth
	spawn.Parent = root
	local ring = Build.part({
		Parent = root,
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(0.1, 12, 12),
		CFrame = CFrame.new(spawnPos + Vector3.new(0, 0.02, 0)) * CFrame.Angles(0, 0, math.rad(90)),
		Color = Color3.fromRGB(120, 10, 10),
		Material = Enum.Material.Neon,
		Transparency = 0.6,
		CanCollide = false,
		CastShadow = false,
	})
	Build.light(ring, Color3.fromRGB(255, 40, 30), 12, 0.8)

	-- Decoração dentro do cercado
	local deco = Build.model("Decoracao", root)
	for _, side in { -1, 1 } do
		local bx = c.X + side * (CAGE_W / 2 - 4)
		for _, bz in { -18, 0 } do
			local bench = CFrame.new(bx, y, c.Z + bz) * CFrame.Angles(0, side * math.rad(90), 0)
			Build.box(deco, Vector3.new(7, 0.4, 1.8), bench * CFrame.new(0, 1.8, 0), C.Wood, Enum.Material.WoodPlanks)
			Build.box(deco, Vector3.new(7, 1.6, 0.3), bench * CFrame.new(0, 2.8, 0.9), C.Wood, Enum.Material.WoodPlanks)
			for _, lx in { -3, 3 } do
				Build.box(deco, Vector3.new(0.4, 1.8, 1.6), bench * CFrame.new(lx, 0.9, 0), C.Iron, Enum.Material.CorrodedMetal)
			end
		end
		Build.lamp(deco, Vector3.new(c.X + side * (CAGE_W / 2 - 3), y, c.Z - 8), nil, 12)
	end
	Build.crate(deco, CFrame.new(c.X - 30, y, c.Z - 26))
	Build.crate(deco, CFrame.new(c.X - 27, y, c.Z - 26.5) * CFrame.Angles(0, 0.4, 0), 2.4)
	Build.barrel(deco, Vector3.new(c.X + 30, y, c.Z - 25))
	for i = -3, 3 do
		Build.pumpkin(deco, Vector3.new(c.X + i * 9.5, y, c.Z - CAGE_D / 2 + 2.2), i % 2 == 0, 0.8)
	end
	Build.sign(deco, CFrame.new(c.X - 18, y, c.Z - 26) * CFrame.Angles(0, math.pi, 0), "NÃO SAIA DO CERCADO", 9)
	Build.sign(deco, CFrame.new(c.X + 18, y, c.Z - 26) * CFrame.Angles(0, math.pi, 0), "Ele está na plantação...", 9)

	-- Quadrados de votação na frente do jogador
	local pads: { Pad } = {}
	local count = Config.VOTE_OPTIONS
	local spacing = 16
	for i = 1, count do
		local x = (i - (count + 1) / 2) * spacing
		table.insert(pads, makePad(root, i, c + Vector3.new(x, 1, 10)))
	end

	-- Placa grande "ESCOLHA O MAPA"
	local banner = Build.box(root, Vector3.new(40, 4, 0.4), CFrame.new(c + Vector3.new(0, 15, 24)), Color3.fromRGB(26, 18, 16), Enum.Material.WoodPlanks)
	for _, x in { -19, 19 } do
		Build.box(root, Vector3.new(0.6, 15, 0.6), CFrame.new(c + Vector3.new(x, 8.5, 24.4)), C.DarkWood, Enum.Material.Wood)
	end
	local bGui = Instance.new("SurfaceGui")
	bGui.Face = Enum.NormalId.Front
	bGui.CanvasSize = Vector2.new(1000, 100)
	bGui.LightInfluence = 0
	bGui.Parent = banner
	local bText = Instance.new("TextLabel")
	bText.Size = UDim2.fromScale(1, 1)
	bText.BackgroundTransparency = 1
	bText.Font = Enum.Font.Creepster
	bText.TextScaled = true
	bText.TextColor3 = Color3.fromRGB(200, 30, 24)
	bText.Text = "PISE NUM QUADRADO PARA VOTAR NO MAPA"
	bText.Parent = bGui

	buildFarmland(root, c)

	return {
		model = root,
		spawn = spawn,
		pads = pads,
		bounds = { min = Vector3.new(x0, y - 2, z0), max = Vector3.new(x1, y + 120, z1) },
	}
end

return Lobby
