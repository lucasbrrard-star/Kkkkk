-- Maps: os mapas da partida. Cada mapa é gerado por código (com um pouco de
-- aleatoriedade a cada partida) e destruído quando a partida acaba.
--
-- Para criar um mapa novo, copie uma das entradas de Maps.List e mude a função build.
-- build(ctx) precisa devolver:
--   survivorSpawns = { Vector3 }  (onde os sobreviventes nascem)
--   killerSpawn    = Vector3      (onde o assassino nasce)
--   generators     = { CFrame }   (onde ficam os geradores)

local Build = require(script.Parent.Build)
local Config = require(game:GetService("ReplicatedStorage"):WaitForChild("Shared"):WaitForChild("Config"))

local C = Build.Colors
local Maps = {}

export type MapInfo = {
	survivorSpawns: { Vector3 },
	killerSpawn: Vector3,
	generators: { CFrame },
}

export type Ctx = {
	center: Vector3,
	half: number,
	rng: Random,
	model: Model,
	props: Model,
	w: (x: number, z: number, y: number?) -> Vector3,
}

export type MapDef = {
	id: string,
	name: string,
	desc: string,
	color: Color3,
	half: number,
	lighting: string,
	build: (ctx: Ctx) -> MapInfo,
}

---------------------------------------------------------------------------------
-- Utilidades
---------------------------------------------------------------------------------

local terrainParams = RaycastParams.new()
terrainParams.FilterType = Enum.RaycastFilterType.Include
terrainParams.FilterDescendantsInstances = { workspace.Terrain }

-- Altura do terreno em (x, z) do mapa
local function groundAt(ctx: Ctx, x: number, z: number): Vector3
	local origin = ctx.w(x, z, 80)
	local hit = workspace:Raycast(origin, Vector3.new(0, -200, 0), terrainParams)
	if hit then
		return hit.Position
	end
	return ctx.w(x, z, 0)
end

local function genCF(ctx: Ctx, x: number, z: number): CFrame
	local p = groundAt(ctx, x, z)
	return CFrame.new(p) * CFrame.Angles(0, ctx.rng:NextNumber(0, math.pi * 2), 0)
end

type Avoid = { p: Vector3, r: number }

-- Espalha pontos aleatórios (coordenadas locais, Y = 0) respeitando distâncias
local function scatter(ctx: Ctx, n: number, minDist: number, avoid: { Avoid }, margin: number): { Vector3 }
	local pts = {}
	local tries = 0
	while #pts < n and tries < n * 40 do
		tries += 1
		local lim = ctx.half - margin
		local p = Vector3.new(ctx.rng:NextNumber(-lim, lim), 0, ctx.rng:NextNumber(-lim, lim))
		local ok = true
		for _, a in avoid do
			if (p - Vector3.new(a.p.X, 0, a.p.Z)).Magnitude < a.r then
				ok = false
				break
			end
		end
		if ok then
			for _, q in pts do
				if (q - p).Magnitude < minDist then
					ok = false
					break
				end
			end
		end
		if ok then
			table.insert(pts, p)
		end
	end
	return pts
end

-- Escolhe k itens aleatórios de uma lista
local function pick<T>(ctx: Ctx, list: { T }, k: number): { T }
	local copy = table.clone(list)
	local out = {}
	for _ = 1, math.min(k, #copy) do
		table.insert(out, table.remove(copy, ctx.rng:NextInteger(1, #copy)) :: T)
	end
	return out
end

local function ring(center: Vector3, count: number, radius: number): { Vector3 }
	local out = {}
	for i = 1, count do
		local a = (i / count) * math.pi * 2
		table.insert(out, center + Vector3.new(math.cos(a) * radius, 3, math.sin(a) * radius))
	end
	return out
end

local function ground(ctx: Ctx, material: Enum.Material)
	workspace.Terrain:FillBlock(CFrame.new(ctx.w(0, 0, -6)), Vector3.new(ctx.half * 2 + 120, 12, ctx.half * 2 + 120), material)
end

local function strip(ctx: Ctx, x: number, z: number, sx: number, sz: number, material: Enum.Material)
	workspace.Terrain:FillBlock(CFrame.new(ctx.w(x, z, -2)), Vector3.new(sx, 4.2, sz), material)
end

-- Paredes invisíveis do mapa
local function bounds(ctx: Ctx)
	Build.invisibleBox(ctx.model, ctx.center, ctx.half * 2, ctx.half * 2, 90)
end

-- Fileira de árvores na borda para "fechar" visualmente o mapa
local function treeBorder(ctx: Ctx, kind: string?)
	local h = ctx.half
	local step = 11
	for i = -h, h, step do
		for _, side in { { i, -h - 4 }, { i, h + 4 }, { -h - 4, i }, { h + 4, i } } do
			local jitter = Vector3.new(ctx.rng:NextNumber(-3, 3), 0, ctx.rng:NextNumber(-3, 3))
			Build.tree(ctx.props, ctx.w(side[1], side[2]) + jitter, ctx.rng, kind or "pine")
		end
	end
end

local function fenceBorder(ctx: Ctx)
	local h = ctx.half
	local corners = { ctx.w(-h, -h), ctx.w(h, -h), ctx.w(h, h), ctx.w(-h, h) }
	for i = 1, 4 do
		Build.fence(ctx.props, corners[i], corners[i % 4 + 1], 4.5)
	end
end

-- Cercado retangular com aberturas no meio de cada lado
local function pen(ctx: Ctx, cx: number, cz: number, w: number, d: number)
	local gap = 7
	local x0, x1, z0, z1 = cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2
	Build.fence(ctx.props, ctx.w(x0, z0), ctx.w(cx - gap / 2, z0))
	Build.fence(ctx.props, ctx.w(cx + gap / 2, z0), ctx.w(x1, z0))
	Build.fence(ctx.props, ctx.w(x0, z1), ctx.w(cx - gap / 2, z1))
	Build.fence(ctx.props, ctx.w(cx + gap / 2, z1), ctx.w(x1, z1))
	Build.fence(ctx.props, ctx.w(x0, z0), ctx.w(x0, cz - gap / 2))
	Build.fence(ctx.props, ctx.w(x0, cz + gap / 2), ctx.w(x0, z1))
	Build.fence(ctx.props, ctx.w(x1, z0), ctx.w(x1, cz - gap / 2))
	Build.fence(ctx.props, ctx.w(x1, cz + gap / 2), ctx.w(x1, z1))
end

local function corner(ctx: Ctx, margin: number): Vector3
	local h = ctx.half - margin
	local corners = { Vector3.new(-h, 0, -h), Vector3.new(h, 0, -h), Vector3.new(-h, 0, h), Vector3.new(h, 0, h) }
	return corners[ctx.rng:NextInteger(1, 4)]
end

---------------------------------------------------------------------------------
-- 1) Milharal Maldito — labirinto de milho
---------------------------------------------------------------------------------
local function buildCornMaze(ctx: Ctx): MapInfo
	local rng = ctx.rng
	local N, CS = 13, 18
	local half = N * CS / 2
	ground(ctx, Enum.Material.Mud)

	local east, south = {}, {}
	for x = 1, N do
		east[x], south[x] = {}, {}
		for y = 1, N do
			east[x][y] = true
			south[x][y] = true
		end
	end
	-- labirinto (backtracking)
	local visited = {}
	local function key(x: number, y: number) return x * 100 + y end
	local stack = { { 1, 1 } }
	visited[key(1, 1)] = true
	while #stack > 0 do
		local cur = stack[#stack]
		local cx, cy = cur[1], cur[2]
		local options = {}
		for _, d in { { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } } do
			local nx, ny = cx + d[1], cy + d[2]
			if nx >= 1 and nx <= N and ny >= 1 and ny <= N and not visited[key(nx, ny)] then
				table.insert(options, { nx, ny })
			end
		end
		if #options == 0 then
			table.remove(stack)
		else
			local n = options[rng:NextInteger(1, #options)]
			local nx, ny = n[1], n[2]
			if nx > cx then
				east[cx][cy] = false
			elseif nx < cx then
				east[nx][ny] = false
			elseif ny > cy then
				south[cx][cy] = false
			else
				south[nx][ny] = false
			end
			visited[key(nx, ny)] = true
			table.insert(stack, { nx, ny })
		end
	end
	-- abre caminhos extras para criar "loops" de perseguição
	for x = 1, N do
		for y = 1, N do
			if x < N and east[x][y] and rng:NextNumber() < 0.24 then
				east[x][y] = false
			end
			if y < N and south[x][y] and rng:NextNumber() < 0.24 then
				south[x][y] = false
			end
		end
	end
	-- clareira no centro
	for x = 6, 8 do
		for y = 6, 8 do
			if x < 8 then
				east[x][y] = false
			end
			if y < 8 then
				south[x][y] = false
			end
		end
	end

	local walls = Build.model("Milho", ctx.model)
	local H = 10
	local function cornWall(size: Vector3, pos: Vector3)
		Build.box(walls, size, CFrame.new(pos + Vector3.new(0, H / 2, 0)), C.Corn, Enum.Material.Grass)
		Build.box(walls, Vector3.new(math.max(size.X - 1, 1), 1.4, math.max(size.Z - 1, 1)), CFrame.new(pos + Vector3.new(0, H + 0.7, 0)), C.CornTop, Enum.Material.Grass, { CanCollide = false })
	end
	local function cellPos(x: number, y: number): Vector3
		return ctx.w(-half + (x - 0.5) * CS, -half + (y - 0.5) * CS)
	end
	for x = 1, N - 1 do
		for y = 1, N do
			if east[x][y] then
				cornWall(Vector3.new(3, H, CS + 3), ctx.w(-half + x * CS, -half + (y - 0.5) * CS))
			end
		end
	end
	for x = 1, N do
		for y = 1, N - 1 do
			if south[x][y] then
				cornWall(Vector3.new(CS + 3, H, 3), ctx.w(-half + (x - 0.5) * CS, -half + y * CS))
			end
		end
	end
	-- borda externa
	cornWall(Vector3.new(half * 2 + 3, H, 3), ctx.w(0, -half))
	cornWall(Vector3.new(half * 2 + 3, H, 3), ctx.w(0, half))
	cornWall(Vector3.new(3, H, half * 2 + 3), ctx.w(-half, 0))
	cornWall(Vector3.new(3, H, half * 2 + 3), ctx.w(half, 0))

	-- geradores em células espalhadas, longe do centro
	local cells = {}
	for x = 1, N do
		for y = 1, N do
			if math.abs(x - 7) > 2 or math.abs(y - 7) > 2 then
				table.insert(cells, { x, y })
			end
		end
	end
	local chosen = {}
	local tries = 0
	while #chosen < Config.Generator.Count and tries < 500 do
		tries += 1
		local c = cells[rng:NextInteger(1, #cells)]
		local ok = true
		for _, o in chosen do
			if math.max(math.abs(o[1] - c[1]), math.abs(o[2] - c[2])) < 4 then
				ok = false
				break
			end
		end
		if ok then
			table.insert(chosen, c)
		end
	end
	local generators = {}
	for _, c in chosen do
		local p = cellPos(c[1], c[2])
		table.insert(generators, CFrame.new(p) * CFrame.Angles(0, rng:NextInteger(0, 3) * math.pi / 2, 0))
	end

	-- decoração
	for i = 1, 7 do
		local c = cells[rng:NextInteger(1, #cells)]
		local p = cellPos(c[1], c[2]) + Vector3.new(rng:NextNumber(-4, 4), 0, rng:NextNumber(-4, 4))
		if i <= 4 then
			Build.scarecrow(ctx.props, CFrame.new(p + Vector3.new(5, 0, 5)) * CFrame.Angles(0, rng:NextNumber(0, 6), 0))
		else
			Build.haybale(ctx.props, CFrame.new(p + Vector3.new(-5, 0, 5)) * CFrame.Angles(0, rng:NextNumber(0, 6), 0))
		end
	end
	for _ = 1, 14 do
		local c = cells[rng:NextInteger(1, #cells)]
		Build.pumpkin(ctx.props, cellPos(c[1], c[2]) + Vector3.new(rng:NextNumber(-6, 6), 0, rng:NextNumber(-6, 6)), true)
	end
	local mid = cellPos(7, 7)
	Build.well(ctx.props, mid)
	for _, o in { Vector3.new(-20, 0, -20), Vector3.new(20, 0, -20), Vector3.new(-20, 0, 20), Vector3.new(20, 0, 20) } do
		Build.lamp(ctx.props, mid + o)
	end
	Build.cart(ctx.props, CFrame.new(mid + Vector3.new(12, 0, -2)) * CFrame.Angles(0, 1.2, 0))

	bounds(ctx)
	local corners = { { 1, 1 }, { N, 1 }, { 1, N }, { N, N } }
	local k = corners[rng:NextInteger(1, 4)]
	return {
		survivorSpawns = ring(mid, 8, 9),
		killerSpawn = cellPos(k[1], k[2]) + Vector3.new(0, 3, 0),
		generators = generators,
	}
end

---------------------------------------------------------------------------------
-- 2) Celeiro Abandonado — fazenda com um celeiro enorme
---------------------------------------------------------------------------------
local function buildBarnFarm(ctx: Ctx): MapInfo
	local rng = ctx.rng
	ground(ctx, Enum.Material.Grass)
	strip(ctx, 0, 0, 90, 110, Enum.Material.Ground)
	strip(ctx, -45, -70, 90, 10, Enum.Material.Ground)

	local gens = pick(ctx, {
		Vector3.new(-14, 0, 2),
		Vector3.new(48, 0, -40),
		Vector3.new(-72, 0, -70),
		Vector3.new(60, 0, 52),
		Vector3.new(-62, 0, 58),
		Vector3.new(-78, 0, -5),
		Vector3.new(85, 0, -85),
		Vector3.new(30, 0, 100),
	}, Config.Generator.Count)

	-- Celeiro principal (quatro portas para dar volta por dentro)
	local barnCF = CFrame.new(ctx.w(0, 0))
	local barn = Build.barn(ctx.props, barnCF, 44, 60, 20, { front = true, back = true, left = true, right = true })
	for _, p in { Vector3.new(-12, 0, -15), Vector3.new(12, 0, -4), Vector3.new(-9, 0, 14) } do
		Build.hayblock(barn, barnCF * CFrame.new(p) * CFrame.Angles(0, rng:NextNumber(-0.3, 0.3), 0), 2)
	end
	-- palheiro (andar de cima) com rampa
	Build.box(barn, Vector3.new(42, 1, 16), barnCF * CFrame.new(0, 9, 21), C.Wood, Enum.Material.WoodPlanks)
	Build.part({
		Parent = barn,
		ClassName = "WedgePart",
		Size = Vector3.new(6, 9.5, 18),
		CFrame = barnCF * CFrame.new(15, 4.75, 4),
		Color = C.Wood,
		Material = Enum.Material.WoodPlanks,
	})
	for _, x in { -18, -6, 6, 18 } do
		Build.box(barn, Vector3.new(1, 8.5, 1), barnCF * CFrame.new(x, 4.25, 13.6), C.DarkWood, Enum.Material.Wood)
	end
	local barnLamp = Build.box(barn, Vector3.new(1, 1.4, 1), barnCF * CFrame.new(0, 15, 0), C.LampLight, Enum.Material.Neon)
	Build.light(barnLamp, C.LampLight, 40, 1.2, true)

	Build.silo(ctx.props, ctx.w(40, -30), 11, 30)
	Build.silo(ctx.props, ctx.w(54, -14), 9, 24)
	Build.building(ctx.props, CFrame.new(ctx.w(-72, -70)) * CFrame.Angles(0, math.rad(90), 0), 26, 20, 12, {
		name = "CasaDaFazenda",
		wallColor = Color3.fromRGB(140, 130, 110),
		trim = C.Trim,
		doors = { front = true, back = true },
		litWindows = true,
	})
	pen(ctx, 60, 52, 32, 26)
	pen(ctx, -62, 58, 28, 30)
	pen(ctx, 70, -80, 26, 22)
	Build.crops(ctx.props, CFrame.new(ctx.w(-78, 10)), 26, 44, "wheat")
	Build.crops(ctx.props, CFrame.new(ctx.w(0, 85)), 56, 20, "corn")
	Build.tractor(ctx.props, CFrame.new(ctx.w(28, 44)) * CFrame.Angles(0, 0.6, 0))
	Build.cart(ctx.props, CFrame.new(ctx.w(-34, -42)) * CFrame.Angles(0, -0.4, 0))
	Build.well(ctx.props, ctx.w(-40, 30))
	Build.scarecrow(ctx.props, CFrame.new(ctx.w(-78, 10)) * CFrame.Angles(0, 0.4, 0))

	local avoid: { Avoid } = {
		{ p = Vector3.new(0, 0, 0), r = 42 },
		{ p = Vector3.new(-72, 0, -70), r = 20 },
		{ p = Vector3.new(-90, 0, -95), r = 15 },
		{ p = Vector3.new(95, 0, 95), r = 12 },
	}
	for _, g in gens do
		table.insert(avoid, { p = g, r = 8 })
	end
	for _, p in scatter(ctx, 14, 12, avoid, 10) do
		Build.haybale(ctx.props, CFrame.new(ctx.w(p.X, p.Z)) * CFrame.Angles(0, rng:NextNumber(0, 6), 0), rng:NextNumber() < 0.4)
	end
	for _, p in scatter(ctx, 16, 14, avoid, 4) do
		Build.tree(ctx.props, ctx.w(p.X, p.Z), rng, "dead")
	end
	for _, p in { Vector3.new(-30, 0, -30), Vector3.new(30, 0, 30), Vector3.new(-30, 0, 40), Vector3.new(36, 0, -55), Vector3.new(-80, 0, 30), Vector3.new(80, 0, 10) } do
		Build.lamp(ctx.props, ctx.w(p.X, p.Z))
	end

	treeBorder(ctx, "dead")
	fenceBorder(ctx)
	bounds(ctx)

	local generators = {}
	for _, g in gens do
		table.insert(generators, genCF(ctx, g.X, g.Z))
	end
	return {
		survivorSpawns = ring(ctx.w(-90, -95), 8, 7),
		killerSpawn = ctx.w(95, 95, 3),
		generators = generators,
	}
end

---------------------------------------------------------------------------------
-- 3) Vila Esquecida — vilarejo abandonado
---------------------------------------------------------------------------------
local function buildVillage(ctx: Ctx): MapInfo
	local rng = ctx.rng
	ground(ctx, Enum.Material.Grass)
	for _, v in { -35, 35 } do
		strip(ctx, v, 0, 14, ctx.half * 2, Enum.Material.Cobblestone)
		strip(ctx, 0, v, ctx.half * 2, 14, Enum.Material.Cobblestone)
	end
	strip(ctx, 0, 0, 44, 44, Enum.Material.Cobblestone)

	local houses = {}
	local palette = {
		Color3.fromRGB(120, 110, 96),
		Color3.fromRGB(96, 84, 76),
		Color3.fromRGB(110, 100, 110),
		Color3.fromRGB(130, 120, 100),
	}
	for _, gx in { -70, 0, 70 } do
		for _, gz in { -70, 0, 70 } do
			if not (gx == 0 and gz == 0) then
				local rot = rng:NextInteger(0, 3) * math.pi / 2
				local w, d = rng:NextInteger(22, 28), rng:NextInteger(18, 24)
				Build.building(ctx.props, CFrame.new(ctx.w(gx, gz)) * CFrame.Angles(0, rot, 0), w, d, 12, {
					name = "Casa",
					wallColor = palette[rng:NextInteger(1, #palette)],
					roofColor = Color3.fromRGB(46, 36, 34),
					trim = C.DarkWood,
					doors = { front = true, back = true },
					litWindows = rng:NextNumber() < 0.3,
				})
				table.insert(houses, Vector3.new(gx, 0, gz))
				-- móveis velhos dentro
				Build.crate(ctx.props, CFrame.new(ctx.w(gx + rng:NextNumber(-6, 6), gz + rng:NextNumber(-4, 4))) * CFrame.Angles(0, rng:NextNumber(0, 3), 0), 2.6)
			end
		end
	end
	Build.well(ctx.props, ctx.w(0, 0))
	Build.tree(ctx.props, ctx.w(12, 12), rng, "dead")
	Build.tree(ctx.props, ctx.w(-13, -10), rng, "dead")

	for _, x in { -35, 35 } do
		for _, z in { -105, -70, -35, 0, 35, 70, 105 } do
			if rng:NextNumber() < 0.6 then
				Build.lamp(ctx.props, ctx.w(x + 6, z))
			end
		end
	end
	for _ = 1, 14 do
		local onX = rng:NextNumber() < 0.5
		local line = if rng:NextNumber() < 0.5 then -35 else 35
		local along = rng:NextNumber(-105, 105)
		local p = if onX then Vector3.new(line + rng:NextNumber(-4, 4), 0, along) else Vector3.new(along, 0, line + rng:NextNumber(-4, 4))
		if p.Magnitude > 25 then
			local r = rng:NextNumber()
			if r < 0.35 then
				Build.barrel(ctx.props, ctx.w(p.X, p.Z))
			elseif r < 0.7 then
				Build.crate(ctx.props, CFrame.new(ctx.w(p.X, p.Z)) * CFrame.Angles(0, rng:NextNumber(0, 3), 0))
			else
				Build.cart(ctx.props, CFrame.new(ctx.w(p.X, p.Z)) * CFrame.Angles(0, rng:NextNumber(0, 6), 0))
			end
		end
	end
	-- cercas quebradas entre as casas
	for _ = 1, 8 do
		local a = Vector3.new(rng:NextNumber(-100, 100), 0, rng:NextNumber(-100, 100))
		local dir = if rng:NextNumber() < 0.5 then Vector3.new(14, 0, 0) else Vector3.new(0, 0, 14)
		if math.abs(a.X) > 50 or math.abs(a.Z) > 50 then
			Build.fence(ctx.props, ctx.w(a.X, a.Z), ctx.w(a.X + dir.X, a.Z + dir.Z))
		end
	end
	local avoid: { Avoid } = { { p = Vector3.new(0, 0, 0), r = 30 } }
	for _, h in houses do
		table.insert(avoid, { p = h, r = 22 })
	end
	for _, v in { -35, 35 } do
		for i = -110, 110, 10 do
			table.insert(avoid, { p = Vector3.new(v, 0, i), r = 9 })
			table.insert(avoid, { p = Vector3.new(i, 0, v), r = 9 })
		end
	end
	for _, p in scatter(ctx, 18, 12, avoid, 6) do
		Build.tree(ctx.props, ctx.w(p.X, p.Z), rng)
	end
	treeBorder(ctx)
	bounds(ctx)

	local genSpots = {}
	for _, h in pick(ctx, houses, 2) do
		table.insert(genSpots, h)
	end
	for _, p in pick(ctx, {
		Vector3.new(35, 0, 0),
		Vector3.new(-35, 0, 0),
		Vector3.new(0, 0, 35),
		Vector3.new(0, 0, -35),
		Vector3.new(35, 0, 95),
		Vector3.new(-35, 0, -95),
		Vector3.new(95, 0, -35),
		Vector3.new(-95, 0, 35),
	}, Config.Generator.Count - 2) do
		table.insert(genSpots, p)
	end
	local generators = {}
	for _, g in genSpots do
		table.insert(generators, genCF(ctx, g.X, g.Z))
	end
	local k = corner(ctx, 12)
	return {
		survivorSpawns = ring(ctx.w(0, 0), 8, 12),
		killerSpawn = ctx.w(k.X, k.Z, 3),
		generators = generators,
	}
end

---------------------------------------------------------------------------------
-- 4) Cemitério da Capela
---------------------------------------------------------------------------------
local function buildGraveyard(ctx: Ctx): MapInfo
	local rng = ctx.rng
	local h = ctx.half
	ground(ctx, Enum.Material.Grass)
	strip(ctx, 0, -20, 10, h * 2, Enum.Material.Ground)
	strip(ctx, 0, -30, h * 2, 10, Enum.Material.Ground)

	-- Capela
	local chapelCF = CFrame.new(ctx.w(0, 75))
	local chapel = Build.building(ctx.props, chapelCF, 26, 40, 16, {
		name = "Capela",
		wallColor = Color3.fromRGB(104, 100, 98),
		wallMat = Enum.Material.Brick,
		roofColor = Color3.fromRGB(36, 32, 36),
		roofMat = Enum.Material.Slate,
		doors = { front = true, back = true },
		doorW = 8,
		doorH = 11,
		roofH = 10,
	})
	Build.box(chapel, Vector3.new(9, 16, 9), chapelCF * CFrame.new(0, 24, -16), Color3.fromRGB(96, 92, 92), Enum.Material.Brick)
	Build.roof(chapel, chapelCF * CFrame.new(0, 32, -16), 9, 9, 8, Color3.fromRGB(36, 32, 36), Enum.Material.Slate, 0.5)
	Build.box(chapel, Vector3.new(0.6, 4, 0.6), chapelCF * CFrame.new(0, 42, -16), C.Iron, Enum.Material.Metal)
	Build.box(chapel, Vector3.new(2.4, 0.6, 0.6), chapelCF * CFrame.new(0, 42.8, -16), C.Iron, Enum.Material.Metal)
	for z = -12, 12, 5 do
		for _, x in { -6.5, 6.5 } do
			Build.box(chapel, Vector3.new(8, 1.6, 1.6), chapelCF * CFrame.new(x, 0.8, z), C.DarkWood, Enum.Material.Wood)
		end
	end
	Build.box(chapel, Vector3.new(8, 3, 3), chapelCF * CFrame.new(0, 1.5, 16), Color3.fromRGB(80, 30, 30), Enum.Material.Fabric)
	for _, x in { -3, 3 } do
		local candle = Build.box(chapel, Vector3.new(0.4, 1, 0.4), chapelCF * CFrame.new(x, 3.5, 16), Color3.fromRGB(255, 200, 120), Enum.Material.Neon)
		Build.light(candle, C.LampLight, 18, 1, true)
	end

	-- Mausoléus (bons para dar voltas fugindo)
	local mausoleums = { Vector3.new(-55, 0, -50), Vector3.new(55, 0, -50), Vector3.new(-60, 0, 20), Vector3.new(60, 0, 15) }
	for _, m in mausoleums do
		local cf = CFrame.new(ctx.w(m.X, m.Z)) * CFrame.Angles(0, if m.X < 0 then math.rad(90) else math.rad(-90), 0)
		local model = Build.model("Mausoleu", ctx.props)
		Build.box(model, Vector3.new(12, 10, 14), cf * CFrame.new(0, 5, 0), Color3.fromRGB(110, 108, 112), Enum.Material.Marble)
		Build.roof(model, cf * CFrame.new(0, 10, 0), 12, 14, 4, Color3.fromRGB(70, 70, 76), Enum.Material.Slate, 1)
		Build.box(model, Vector3.new(5, 7, 0.4), cf * CFrame.new(0, 3.5, -7.1), Color3.fromRGB(16, 16, 20), Enum.Material.Metal)
		for _, x in { -5, 5 } do
			Build.cyl(model, cf * CFrame.new(x, 5, -8), 10, 1.4, Color3.fromRGB(150, 148, 150), Enum.Material.Marble)
		end
	end

	-- Túmulos em fileiras
	local function nearMaus(x: number, z: number)
		for _, m in mausoleums do
			if math.abs(m.X - x) < 14 and math.abs(m.Z - z) < 14 then
				return true
			end
		end
		return false
	end
	for gx = -95, 95, 10 do
		for gz = -95, 40, 11 do
			if math.abs(gx) > 9 and math.abs(gz + 30) > 7 and not nearMaus(gx, gz) and rng:NextNumber() > 0.32 then
				Build.tombstone(ctx.props, CFrame.new(ctx.w(gx + rng:NextNumber(-1.5, 1.5), gz)), rng)
			end
		end
	end
	-- Jazigos cercados com grade
	for _, plot in { { -30, -78 }, { 30, -2 } } do
		local x, z = plot[1], plot[2]
		local y = 0
		Build.bars(ctx.props, ctx.w(x - 6, z - 4, y), ctx.w(x + 6, z - 4, y), 4, 2)
		Build.bars(ctx.props, ctx.w(x - 6, z + 4, y), ctx.w(x + 6, z + 4, y), 4, 2)
		Build.bars(ctx.props, ctx.w(x - 6, z - 4, y), ctx.w(x - 6, z + 1, y), 4, 2)
	end
	for z = -100, 40, 28 do
		Build.lamp(ctx.props, ctx.w(6, z), Color3.fromRGB(160, 200, 255))
	end
	local avoid: { Avoid } = { { p = Vector3.new(0, 0, 75), r = 30 }, { p = Vector3.new(0, 0, -100), r = 15 } }
	for _, m in mausoleums do
		table.insert(avoid, { p = m, r = 14 })
	end
	for _, p in scatter(ctx, 14, 16, avoid, 5) do
		Build.tree(ctx.props, ctx.w(p.X, p.Z), rng, "dead")
	end

	-- Muro de pedra em volta, com portão de ferro ao sul
	local wallModel = Build.model("Muro", ctx.props)
	for _, s in { { 0, -h, h * 2, 2 }, { 0, h, h * 2, 2 }, { -h, 0, 2, h * 2 }, { h, 0, 2, h * 2 } } do
		Build.box(wallModel, Vector3.new(s[3] + 2, 6, s[4] + 2), CFrame.new(ctx.w(s[1], s[2], 3)), Color3.fromRGB(80, 78, 80), Enum.Material.Cobblestone)
	end
	for i = -h, h, 23 do
		for _, s in { { i, -h }, { i, h }, { -h, i }, { h, i } } do
			Build.box(wallModel, Vector3.new(3, 8, 3), CFrame.new(ctx.w(s[1], s[2], 4)), Color3.fromRGB(70, 68, 72), Enum.Material.Cobblestone)
		end
	end
	treeBorder(ctx, "dead")
	bounds(ctx)

	local gens = pick(ctx, {
		Vector3.new(0, 0, 80),
		Vector3.new(-44, 0, -50),
		Vector3.new(44, 0, -50),
		Vector3.new(-49, 0, 20),
		Vector3.new(49, 0, 15),
		Vector3.new(-30, 0, -74),
		Vector3.new(30, 0, 2),
		Vector3.new(-90, 0, 80),
		Vector3.new(90, 0, 80),
	}, Config.Generator.Count)
	local generators = {}
	for _, g in gens do
		table.insert(generators, genCF(ctx, g.X, g.Z))
	end
	return {
		survivorSpawns = ring(ctx.w(0, -100), 8, 7),
		killerSpawn = ctx.w(0, 108, 3),
		generators = generators,
	}
end

---------------------------------------------------------------------------------
-- 5) Floresta Sussurrante
---------------------------------------------------------------------------------
local function buildForest(ctx: Ctx): MapInfo
	local rng = ctx.rng
	ground(ctx, Enum.Material.LeafyGrass)
	local lake = Vector3.new(45, 0, -35)
	workspace.Terrain:FillBlock(CFrame.new(ctx.w(lake.X, lake.Z, -2.5)), Vector3.new(56, 5, 40), Enum.Material.Water)
	strip(ctx, -50, 10, 8, 90, Enum.Material.Ground)

	local cabin = Vector3.new(-50, 0, 45)
	Build.building(ctx.props, CFrame.new(ctx.w(cabin.X, cabin.Z)) * CFrame.Angles(0, math.rad(20), 0), 20, 16, 10, {
		name = "Cabana",
		wallColor = C.Wood,
		wallMat = Enum.Material.Wood,
		roofColor = C.DarkWood,
		doors = { front = true, back = true },
		litWindows = true,
	})
	-- fogueira
	local fire = ctx.w(-35, 25)
	for i = 0, 3 do
		Build.cylX(ctx.props, CFrame.new(fire + Vector3.new(0, 0.5, 0)) * CFrame.Angles(0, i * math.pi / 4, 0), 4, 0.7, C.DarkWood, Enum.Material.Wood)
	end
	local flame = Build.box(ctx.props, Vector3.new(1.4, 1.8, 1.4), CFrame.new(fire + Vector3.new(0, 1.4, 0)), Color3.fromRGB(255, 120, 30), Enum.Material.Neon, { CanCollide = false })
	Build.light(flame, Color3.fromRGB(255, 120, 40), 30, 2, true)
	for _ = 1, 10 do
		local a = rng:NextNumber(0, math.pi * 2)
		Build.rock(ctx.props, ctx.w(lake.X + math.cos(a) * 30, lake.Z + math.sin(a) * 22), rng)
	end

	local gensLocal = scatter(ctx, Config.Generator.Count, 55, {
		{ p = lake, r = 34 },
		{ p = cabin, r = 16 },
		{ p = Vector3.new(-85, 0, -85), r = 30 },
	}, 18)
	local avoid: { Avoid } = {
		{ p = lake, r = 33 },
		{ p = cabin, r = 18 },
		{ p = Vector3.new(-35, 0, 25), r = 8 },
		{ p = Vector3.new(-85, 0, -85), r = 14 },
		{ p = Vector3.new(90, 0, 90), r = 10 },
	}
	for _, g in gensLocal do
		table.insert(avoid, { p = g, r = 9 })
	end
	for _, p in scatter(ctx, 95, 10, avoid, 4) do
		local r = rng:NextNumber()
		Build.tree(ctx.props, ctx.w(p.X, p.Z), rng, if r < 0.4 then "pine" elseif r < 0.7 then "dead" else "leafy")
	end
	for _, p in scatter(ctx, 26, 12, avoid, 8) do
		if rng:NextNumber() < 0.5 then
			Build.log(ctx.props, ctx.w(p.X, p.Z), rng)
		else
			Build.rock(ctx.props, ctx.w(p.X, p.Z), rng, rng:NextNumber(0.8, 1.6))
		end
	end
	treeBorder(ctx, "pine")
	bounds(ctx)

	local generators = {}
	for _, g in gensLocal do
		table.insert(generators, genCF(ctx, g.X, g.Z))
	end
	return {
		survivorSpawns = ring(ctx.w(-85, -85), 8, 7),
		killerSpawn = ctx.w(90, 90, 3),
		generators = generators,
	}
end

---------------------------------------------------------------------------------
-- 6) Moinho Velho — colina com moinho, rio e plantações
---------------------------------------------------------------------------------
local function buildMill(ctx: Ctx): MapInfo
	local rng = ctx.rng
	ground(ctx, Enum.Material.Grass)
	workspace.Terrain:FillBall(ctx.w(0, 0, -28), 38, Enum.Material.Grass)
	workspace.Terrain:FillBlock(CFrame.new(ctx.w(0, 60, -2.5)), Vector3.new(ctx.half * 2 + 120, 5, 16), Enum.Material.Water)

	Build.windmill(ctx.props, ctx.w(0, 0, 9), Vector3.new(0, 0, -1))

	-- pontes sobre o rio
	for _, bx in { -60, 60 } do
		local bridge = Build.model("Ponte", ctx.props)
		Build.box(bridge, Vector3.new(10, 1, 26), CFrame.new(ctx.w(bx, 60, 0.6)), C.OldWood, Enum.Material.WoodPlanks)
		for _, sx in { -4.8, 4.8 } do
			Build.box(bridge, Vector3.new(0.5, 3, 26), CFrame.new(ctx.w(bx + sx, 60, 2.6)), C.DarkWood, Enum.Material.Wood)
		end
		Build.part({
			Parent = bridge,
			ClassName = "WedgePart",
			Size = Vector3.new(10, 1.1, 4),
			CFrame = CFrame.new(ctx.w(bx, 45, 0.55)),
			Color = C.OldWood,
			Material = Enum.Material.WoodPlanks,
		})
		Build.part({
			Parent = bridge,
			ClassName = "WedgePart",
			Size = Vector3.new(10, 1.1, 4),
			CFrame = CFrame.new(ctx.w(bx, 75, 0.55)) * CFrame.Angles(0, math.pi, 0),
			Color = C.OldWood,
			Material = Enum.Material.WoodPlanks,
		})
	end

	Build.crops(ctx.props, CFrame.new(ctx.w(-60, -50)), 48, 40, "wheat")
	Build.crops(ctx.props, CFrame.new(ctx.w(65, -55)), 40, 40, "wheat")
	Build.crops(ctx.props, CFrame.new(ctx.w(-70, 100)), 40, 22, "corn")
	for _ = 1, 18 do
		Build.pumpkin(ctx.props, ctx.w(60 + rng:NextNumber(-16, 16), 100 + rng:NextNumber(-10, 10)), rng:NextNumber() < 0.5, rng:NextNumber(0.8, 1.5))
	end
	Build.building(ctx.props, CFrame.new(ctx.w(92, -5)) * CFrame.Angles(0, math.rad(90), 0), 16, 12, 9, {
		name = "Galpao",
		wallColor = Color3.fromRGB(90, 80, 70),
		roofColor = Color3.fromRGB(60, 56, 54),
		roofMat = Enum.Material.CorrodedMetal,
		doors = { front = true, back = true },
	})
	Build.scarecrow(ctx.props, CFrame.new(ctx.w(-60, -50)) * CFrame.Angles(0, 0.5, 0))
	Build.scarecrow(ctx.props, CFrame.new(ctx.w(65, -55)) * CFrame.Angles(0, -0.5, 0))
	Build.fence(ctx.props, ctx.w(-86, -72), ctx.w(-34, -72))
	Build.fence(ctx.props, ctx.w(42, -78), ctx.w(88, -78))
	Build.fence(ctx.props, ctx.w(-30, 30), ctx.w(30, 30))

	local gens = pick(ctx, {
		Vector3.new(0, 0, -16),
		Vector3.new(-60, 0, -50),
		Vector3.new(65, 0, -55),
		Vector3.new(-70, 0, 88),
		Vector3.new(60, 0, 100),
		Vector3.new(92, 0, -5),
		Vector3.new(-98, 0, 20),
		Vector3.new(20, 0, -100),
	}, Config.Generator.Count)
	local avoid: { Avoid } = {
		{ p = Vector3.new(0, 0, 0), r = 28 },
		{ p = Vector3.new(0, 0, 60), r = 12 },
		{ p = Vector3.new(-80, 0, -100), r = 14 },
		{ p = Vector3.new(80, 0, 105), r = 12 },
		{ p = Vector3.new(-60, 0, -50), r = 28 },
		{ p = Vector3.new(65, 0, -55), r = 26 },
		{ p = Vector3.new(60, 0, 100), r = 18 },
	}
	for _, g in gens do
		table.insert(avoid, { p = g, r = 8 })
	end
	for _, p in scatter(ctx, 10, 12, avoid, 10) do
		Build.haybale(ctx.props, CFrame.new(ctx.w(p.X, p.Z)) * CFrame.Angles(0, rng:NextNumber(0, 6), 0), rng:NextNumber() < 0.5)
	end
	for _, p in scatter(ctx, 18, 14, avoid, 4) do
		Build.tree(ctx.props, ctx.w(p.X, p.Z), rng)
	end
	for _, p in { Vector3.new(-60, 0, 50), Vector3.new(60, 0, 50), Vector3.new(-20, 0, -30), Vector3.new(30, 0, 85), Vector3.new(-90, 0, -20) } do
		Build.lamp(ctx.props, ctx.w(p.X, p.Z))
	end
	treeBorder(ctx)
	fenceBorder(ctx)
	bounds(ctx)

	local generators = {}
	for _, g in gens do
		table.insert(generators, genCF(ctx, g.X, g.Z))
	end
	return {
		survivorSpawns = ring(ctx.w(-80, -100), 8, 7),
		killerSpawn = ctx.w(80, 105, 3),
		generators = generators,
	}
end

---------------------------------------------------------------------------------
-- Lista de mapas (a cada votação, 4 deles são sorteados para os quadrados)
---------------------------------------------------------------------------------
Maps.List = {
	{
		id = "milharal",
		name = "Milharal Maldito",
		desc = "Um labirinto de milho onde algo se mexe entre as fileiras.",
		color = Color3.fromRGB(190, 170, 60),
		half = 117,
		lighting = "Milharal",
		build = buildCornMaze,
	},
	{
		id = "celeiro",
		name = "Celeiro Abandonado",
		desc = "A fazenda dos Moraes. Ninguém voltou depois da última colheita.",
		color = Color3.fromRGB(200, 50, 40),
		half = 120,
		lighting = "Celeiro",
		build = buildBarnFarm,
	},
	{
		id = "vila",
		name = "Vila Esquecida",
		desc = "Casas vazias, portas abertas e postes que piscam sozinhos.",
		color = Color3.fromRGB(140, 100, 200),
		half = 120,
		lighting = "Vila",
		build = buildVillage,
	},
	{
		id = "cemiterio",
		name = "Cemitério da Capela",
		desc = "Túmulos tortos, mausoléus e um sino que toca sem vento.",
		color = Color3.fromRGB(110, 150, 220),
		half = 115,
		lighting = "Cemiterio",
		build = buildGraveyard,
	},
	{
		id = "floresta",
		name = "Floresta Sussurrante",
		desc = "Neblina densa, uma cabana e um lago escuro.",
		color = Color3.fromRGB(60, 160, 90),
		half = 120,
		lighting = "Floresta",
		build = buildForest,
	},
	{
		id = "moinho",
		name = "Moinho Velho",
		desc = "O moinho ainda gira... mas ninguém mora lá há anos.",
		color = Color3.fromRGB(220, 130, 50),
		half = 120,
		lighting = "Moinho",
		build = buildMill,
	},
} :: { MapDef }

-- Sorteia `count` mapas diferentes para a votação
function Maps.randomOptions(count: number): { MapDef }
	local pool = table.clone(Maps.List)
	local out = {}
	for _ = 1, math.min(count, #pool) do
		table.insert(out, table.remove(pool, math.random(1, #pool)) :: MapDef)
	end
	return out
end

export type LoadedMap = {
	def: MapDef,
	model: Model,
	info: MapInfo,
	destroy: () -> (),
}

function Maps.load(def: MapDef, seed: number?): LoadedMap
	local center = Config.MAP_CENTER
	local model = Build.model("Mapa_" .. def.id, workspace)
	local props = Build.model("Objetos", model)
	local ctx: Ctx = {
		center = center,
		half = def.half,
		rng = Random.new(seed or os.time()),
		model = model,
		props = props,
		w = function(x: number, z: number, y: number?): Vector3
			return center + Vector3.new(x, y or 0, z)
		end,
	}
	local info = def.build(ctx)

	local size = def.half * 2 + 140
	return {
		def = def,
		model = model,
		info = info,
		destroy = function()
			model:Destroy()
			workspace.Terrain:FillBlock(CFrame.new(center + Vector3.new(0, 15, 0)), Vector3.new(size, 70, size), Enum.Material.Air)
		end,
	}
end

return Maps
