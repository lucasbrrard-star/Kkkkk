-- Build: funções para montar o cenário só com peças (sem precisar de modelos da Toolbox).
-- Tudo é criado por código, então o lugar funciona logo que você aperta Play.

local CollectionService = game:GetService("CollectionService")

local Build = {}

-- Paleta usada no jogo inteiro ------------------------------------------------
Build.Colors = {
	Wood = Color3.fromRGB(92, 64, 44),
	DarkWood = Color3.fromRGB(58, 40, 28),
	OldWood = Color3.fromRGB(120, 104, 86),
	BarnRed = Color3.fromRGB(120, 32, 28),
	Trim = Color3.fromRGB(200, 194, 180),
	Iron = Color3.fromRGB(38, 38, 42),
	Stone = Color3.fromRGB(96, 96, 100),
	DarkStone = Color3.fromRGB(60, 60, 66),
	Hay = Color3.fromRGB(196, 160, 80),
	Wheat = Color3.fromRGB(186, 150, 72),
	Corn = Color3.fromRGB(110, 118, 52),
	CornTop = Color3.fromRGB(170, 150, 90),
	Leaves = Color3.fromRGB(46, 62, 38),
	DeadLeaves = Color3.fromRGB(84, 70, 44),
	Pumpkin = Color3.fromRGB(204, 98, 26),
	LampLight = Color3.fromRGB(255, 180, 100),
	Burlap = Color3.fromRGB(150, 120, 80),
	Rust = Color3.fromRGB(110, 70, 44),
}
local C = Build.Colors

local function apply(inst: Instance, props: { [string]: any })
	for key, value in props do
		if key ~= "Parent" and key ~= "ClassName" and key ~= "Tags" and key ~= "Attributes" then
			(inst :: any)[key] = value
		end
	end
	if props.Tags then
		for _, tag in props.Tags do
			CollectionService:AddTag(inst, tag)
		end
	end
	if props.Attributes then
		for name, value in props.Attributes do
			inst:SetAttribute(name, value)
		end
	end
	inst.Parent = props.Parent
	return inst
end

function Build.part(props: { [string]: any }): BasePart
	local p = Instance.new(props.ClassName or "Part") :: BasePart
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Material = Enum.Material.SmoothPlastic
	return apply(p, props) :: BasePart
end

function Build.model(name: string, parent: Instance?): Model
	local m = Instance.new("Model")
	m.Name = name
	m.Parent = parent
	return m
end

-- Caixa simples
function Build.box(parent: Instance, size: Vector3, cf: CFrame, color: Color3, material: Enum.Material?, extra: { [string]: any }?)
	local props: { [string]: any } = {
		Parent = parent,
		Size = size,
		CFrame = cf,
		Color = color,
		Material = material or Enum.Material.SmoothPlastic,
	}
	if extra then
		for k, v in extra do
			props[k] = v
		end
	end
	return Build.part(props)
end

-- Cilindro em pé (o eixo do cilindro segue o "Up" do CFrame)
function Build.cyl(parent: Instance, cf: CFrame, height: number, diameter: number, color: Color3, material: Enum.Material?)
	return Build.part({
		Parent = parent,
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(height, diameter, diameter),
		CFrame = cf * CFrame.Angles(0, 0, math.rad(90)),
		Color = color,
		Material = material or Enum.Material.SmoothPlastic,
	})
end

-- Cilindro deitado (eixo segue o "Right" do CFrame)
function Build.cylX(parent: Instance, cf: CFrame, length: number, diameter: number, color: Color3, material: Enum.Material?)
	return Build.part({
		Parent = parent,
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(length, diameter, diameter),
		CFrame = cf,
		Color = color,
		Material = material or Enum.Material.SmoothPlastic,
	})
end

function Build.ball(parent: Instance, pos: Vector3, diameter: number, color: Color3, material: Enum.Material?)
	return Build.part({
		Parent = parent,
		Shape = Enum.PartType.Ball,
		Size = Vector3.new(diameter, diameter, diameter),
		CFrame = CFrame.new(pos),
		Color = color,
		Material = material or Enum.Material.SmoothPlastic,
	})
end

-- Elipsoide (usa SpecialMesh do tipo Sphere, não precisa de asset)
function Build.ellipsoid(parent: Instance, size: Vector3, cf: CFrame, color: Color3, material: Enum.Material?)
	local p = Build.box(parent, size, cf, color, material)
	local mesh = Instance.new("SpecialMesh")
	mesh.MeshType = Enum.MeshType.Sphere
	mesh.Parent = p
	return p
end

-- Barra entre dois pontos
function Build.beam(parent: Instance, a: Vector3, b: Vector3, thickness: number, color: Color3, material: Enum.Material?)
	local length = (b - a).Magnitude
	return Build.box(
		parent,
		Vector3.new(thickness, thickness, length),
		CFrame.lookAt((a + b) / 2, b),
		color,
		material
	)
end

-- Luz pontual com tag de "piscar"
function Build.light(parent: BasePart, color: Color3, range: number, brightness: number, flicker: boolean?)
	local light = Instance.new("PointLight")
	light.Color = color
	light.Range = range
	light.Brightness = brightness
	light.Shadows = true
	light.Parent = parent
	if flicker then
		CollectionService:AddTag(parent, "Flicker")
	end
	return light
end

---------------------------------------------------------------------------------
-- Cercas e grades
---------------------------------------------------------------------------------

-- Cerca de madeira entre dois pontos no chão
function Build.fence(parent: Instance, a: Vector3, b: Vector3, height: number?, color: Color3?)
	local h = height or 4
	local col = color or C.OldWood
	local model = Build.model("Cerca", parent)
	local dir = b - a
	local length = dir.Magnitude
	local posts = math.max(1, math.floor(length / 6))
	for i = 0, posts do
		local p = a + dir * (i / posts)
		Build.box(model, Vector3.new(0.7, h + 0.6, 0.7), CFrame.new(p + Vector3.new(0, (h + 0.6) / 2, 0)), col, Enum.Material.Wood)
	end
	for _, y in { h * 0.45, h * 0.85 } do
		Build.beam(model, a + Vector3.new(0, y, 0), b + Vector3.new(0, y, 0), 0.4, col, Enum.Material.Wood)
	end
	return model
end

-- Grade de ferro (cercado) entre dois pontos
function Build.bars(parent: Instance, a: Vector3, b: Vector3, height: number, spacing: number?)
	local model = Build.model("Grade", parent)
	local gap = spacing or 1.6
	local dir = b - a
	local length = dir.Magnitude
	local count = math.max(1, math.floor(length / gap))
	for i = 0, count do
		local p = a + dir * (i / count)
		Build.cyl(model, CFrame.new(p + Vector3.new(0, height / 2, 0)), height, 0.32, C.Iron, Enum.Material.CorrodedMetal)
		-- ponta de lança
		Build.box(
			model,
			Vector3.new(0.35, 0.6, 0.35),
			CFrame.new(p + Vector3.new(0, height + 0.25, 0)) * CFrame.Angles(0, math.rad(45), math.rad(45)),
			C.Iron,
			Enum.Material.CorrodedMetal
		)
	end
	for _, y in { 0.4, height * 0.5, height - 0.6 } do
		Build.beam(model, a + Vector3.new(0, y, 0), b + Vector3.new(0, y, 0), 0.35, C.Iron, Enum.Material.CorrodedMetal)
	end
	return model
end

-- Parede invisível (bloqueia o jogador mas ninguém vê)
function Build.invisibleWall(parent: Instance, size: Vector3, cf: CFrame)
	return Build.part({
		Parent = parent,
		Name = "ParedeInvisivel",
		Size = size,
		CFrame = cf,
		Transparency = 1,
		CanCollide = true,
		CastShadow = false,
	})
end

-- Caixa de paredes invisíveis ao redor de um retângulo (com teto)
function Build.invisibleBox(parent: Instance, center: Vector3, sizeX: number, sizeZ: number, height: number)
	local folder = Instance.new("Folder")
	folder.Name = "ParedesInvisiveis"
	folder.Parent = parent
	local t = 4
	local y = center.Y + height / 2
	Build.invisibleWall(folder, Vector3.new(sizeX + t * 2, height, t), CFrame.new(center.X, y, center.Z - sizeZ / 2 - t / 2))
	Build.invisibleWall(folder, Vector3.new(sizeX + t * 2, height, t), CFrame.new(center.X, y, center.Z + sizeZ / 2 + t / 2))
	Build.invisibleWall(folder, Vector3.new(t, height, sizeZ), CFrame.new(center.X - sizeX / 2 - t / 2, y, center.Z))
	Build.invisibleWall(folder, Vector3.new(t, height, sizeZ), CFrame.new(center.X + sizeX / 2 + t / 2, y, center.Z))
	Build.invisibleWall(folder, Vector3.new(sizeX + t * 2, t, sizeZ + t * 2), CFrame.new(center.X, center.Y + height + t / 2, center.Z))
	return folder
end

---------------------------------------------------------------------------------
-- Construções
---------------------------------------------------------------------------------

-- Parede com (ou sem) abertura de porta. cf = centro da base da parede, eixo X = comprimento.
local function wall(parent: Instance, cf: CFrame, length: number, h: number, t: number, color: Color3, mat: Enum.Material, doorW: number?, doorH: number?)
	if not doorW then
		Build.box(parent, Vector3.new(length, h, t), cf * CFrame.new(0, h / 2, 0), color, mat)
		return
	end
	local dh = math.min(doorH or 8, h - 1)
	local side = (length - doorW) / 2
	Build.box(parent, Vector3.new(side, h, t), cf * CFrame.new(-length / 2 + side / 2, h / 2, 0), color, mat)
	Build.box(parent, Vector3.new(side, h, t), cf * CFrame.new(length / 2 - side / 2, h / 2, 0), color, mat)
	Build.box(parent, Vector3.new(doorW, h - dh, t), cf * CFrame.new(0, dh + (h - dh) / 2, 0), color, mat)
end

-- Telhado em "V" feito com duas WedgeParts. Cumeeira ao longo do eixo Z local.
function Build.roof(parent: Instance, cf: CFrame, w: number, d: number, rh: number, color: Color3, mat: Enum.Material?, overhang: number?)
	local oh = overhang or 1.5
	local halfW = w / 2 + oh
	local m = mat or Enum.Material.WoodPlanks
	-- metade esquerda: lado alto aponta para +X (centro)
	Build.part({
		Parent = parent,
		ClassName = "WedgePart",
		Size = Vector3.new(d + oh * 2, rh, halfW),
		CFrame = cf * CFrame.fromMatrix(Vector3.new(-halfW / 2, rh / 2, 0), Vector3.new(0, 0, -1), Vector3.new(0, 1, 0)),
		Color = color,
		Material = m,
	})
	Build.part({
		Parent = parent,
		ClassName = "WedgePart",
		Size = Vector3.new(d + oh * 2, rh, halfW),
		CFrame = cf * CFrame.fromMatrix(Vector3.new(halfW / 2, rh / 2, 0), Vector3.new(0, 0, 1), Vector3.new(0, 1, 0)),
		Color = color,
		Material = m,
	})
end

export type BuildingOptions = {
	wallColor: Color3?,
	wallMat: Enum.Material?,
	roofColor: Color3?,
	roofMat: Enum.Material?,
	roofH: number?,
	doors: { [string]: boolean }?, -- front / back / left / right
	doorW: number?,
	doorH: number?,
	windows: boolean?,
	litWindows: boolean?,
	floorColor: Color3?,
	trim: Color3?,
	name: string?,
}

-- Construção oca com portas (a frente fica no -Z do CFrame, igual ao LookVector)
function Build.building(parent: Instance, cf: CFrame, w: number, d: number, h: number, opts: BuildingOptions?)
	local o: BuildingOptions = opts or {}
	local model = Build.model(o.name or "Casa", parent)
	local t = 1
	local wc = o.wallColor or C.OldWood
	local wm = o.wallMat or Enum.Material.WoodPlanks
	local doors = o.doors or { front = true }
	local dw, dh = o.doorW or 6, o.doorH or 8

	Build.box(model, Vector3.new(w, 0.4, d), cf * CFrame.new(0, 0.2, 0), o.floorColor or C.DarkWood, Enum.Material.WoodPlanks)

	wall(model, cf * CFrame.new(0, 0, -d / 2 + t / 2), w, h, t, wc, wm, if doors.front then dw else nil, dh)
	wall(model, cf * CFrame.new(0, 0, d / 2 - t / 2), w, h, t, wc, wm, if doors.back then dw else nil, dh)
	wall(model, cf * CFrame.new(-w / 2 + t / 2, 0, 0) * CFrame.Angles(0, math.rad(90), 0), d - t * 2, h, t, wc, wm, if doors.left then dw else nil, dh)
	wall(model, cf * CFrame.new(w / 2 - t / 2, 0, 0) * CFrame.Angles(0, math.rad(90), 0), d - t * 2, h, t, wc, wm, if doors.right then dw else nil, dh)

	-- Cantos com acabamento
	if o.trim then
		for _, sx in { -1, 1 } do
			for _, sz in { -1, 1 } do
				Build.box(model, Vector3.new(1.3, h, 1.3), cf * CFrame.new(sx * (w / 2 - 0.4), h / 2, sz * (d / 2 - 0.4)), o.trim, Enum.Material.Wood)
			end
		end
	end

	-- Janelas (decoração por fora das paredes laterais)
	if o.windows ~= false then
		local winColor = if o.litWindows then Color3.fromRGB(255, 170, 80) else Color3.fromRGB(20, 22, 28)
		local winMat = if o.litWindows then Enum.Material.Neon else Enum.Material.Glass
		local count = math.max(1, math.floor(d / 10))
		for i = 1, count do
			local z = -d / 2 + (i - 0.5) * (d / count)
			for _, sx in { -1, 1 } do
				local side = if sx < 0 then "left" else "right"
				if not (doors[side] and math.abs(z) < dw) then
					local win = Build.box(
						model,
						Vector3.new(0.2, 3, 3),
						cf * CFrame.new(sx * (w / 2 + 0.05), h * 0.55, z),
						winColor,
						winMat
					)
					if o.litWindows then
						Build.light(win, C.LampLight, 14, 0.8, true)
					end
					-- moldura
					Build.box(model, Vector3.new(0.3, 0.4, 3.6), cf * CFrame.new(sx * (w / 2 + 0.1), h * 0.55 + 1.7, z), C.DarkWood, Enum.Material.Wood)
					Build.box(model, Vector3.new(0.3, 0.4, 3.6), cf * CFrame.new(sx * (w / 2 + 0.1), h * 0.55 - 1.7, z), C.DarkWood, Enum.Material.Wood)
				end
			end
		end
	end

	Build.roof(model, cf * CFrame.new(0, h, 0), w, d, o.roofH or math.max(4, w * 0.35), o.roofColor or C.DarkWood, o.roofMat)
	return model
end

-- Celeiro vermelho clássico
function Build.barn(parent: Instance, cf: CFrame, w: number, d: number, h: number, doors: { [string]: boolean }?)
	local model = Build.building(parent, cf, w, d, h, {
		name = "Celeiro",
		wallColor = C.BarnRed,
		wallMat = Enum.Material.WoodPlanks,
		roofColor = Color3.fromRGB(52, 46, 44),
		roofMat = Enum.Material.CorrodedMetal,
		roofH = w * 0.4,
		doors = doors or { front = true, back = true },
		doorW = math.min(14, w * 0.4),
		doorH = math.min(14, h - 3),
		trim = C.Trim,
		windows = false,
	})
	-- "X" branco das portas e janela do palheiro
	local dw = math.min(14, w * 0.4)
	for _, sz in { -1, 1 } do
		local face = cf * CFrame.new(0, 0, sz * (d / 2 + 0.1))
		Build.box(model, Vector3.new(dw + 1.5, 1, 0.3), face * CFrame.new(0, math.min(14, h - 3) + 0.5, 0), C.Trim, Enum.Material.Wood)
		Build.box(model, Vector3.new(5, 4, 0.3), face * CFrame.new(0, h - 1.5, 0), Color3.fromRGB(16, 14, 14), Enum.Material.Wood)
	end
	return model
end

function Build.silo(parent: Instance, pos: Vector3, diameter: number, height: number)
	local model = Build.model("Silo", parent)
	Build.cyl(model, CFrame.new(pos + Vector3.new(0, height / 2, 0)), height, diameter, Color3.fromRGB(150, 150, 150), Enum.Material.CorrodedMetal)
	Build.ball(model, pos + Vector3.new(0, height, 0), diameter, Color3.fromRGB(120, 120, 124), Enum.Material.CorrodedMetal)
	for i = 1, 4 do
		Build.cyl(model, CFrame.new(pos + Vector3.new(0, i * height / 5, 0)), 0.4, diameter + 0.3, C.Rust, Enum.Material.CorrodedMetal)
	end
	-- escada
	for y = 1, height - 1, 2 do
		Build.box(model, Vector3.new(1.6, 0.2, 0.2), CFrame.new(pos + Vector3.new(0, y, -diameter / 2 - 0.4)), C.Iron, Enum.Material.Metal)
	end
	return model
end

-- Moinho com pás que giram (o cliente gira tudo com a tag "Spin")
function Build.windmill(parent: Instance, pos: Vector3, facing: Vector3?)
	local model = Build.model("Moinho", parent)
	local look = facing or Vector3.new(0, 0, -1)
	local base = CFrame.lookAt(pos, pos + Vector3.new(look.X, 0, look.Z))
	local levels = 5
	local y = 0
	for i = 0, levels - 1 do
		local wdt = 16 - i * 2.2
		local hgt = 6
		Build.box(model, Vector3.new(wdt, hgt, wdt), base * CFrame.new(0, y + hgt / 2, 0), if i % 2 == 0 then C.OldWood else C.Wood, Enum.Material.WoodPlanks)
		y += hgt
	end
	Build.box(model, Vector3.new(4, 7, 0.4), base * CFrame.new(0, 3.5, -8.05), C.DarkWood, Enum.Material.Wood) -- porta
	Build.roof(model, base * CFrame.new(0, y, 0), 7, 7, 4, C.DarkWood, Enum.Material.WoodPlanks, 1)
	local hub = base * CFrame.new(0, y - 2, -5)
	Build.cylX(model, hub * CFrame.Angles(0, math.rad(90), 0), 3, 1.4, C.Iron, Enum.Material.CorrodedMetal)

	local blades = Build.model("Pas", model)
	for i = 0, 3 do
		local rot = hub * CFrame.new(0, 0, -1.6) * CFrame.Angles(0, 0, i * math.pi / 2)
		Build.box(blades, Vector3.new(0.6, 14, 0.4), rot * CFrame.new(0, 7.5, 0), C.DarkWood, Enum.Material.Wood)
		Build.box(blades, Vector3.new(3.4, 11, 0.15), rot * CFrame.new(1.9, 8.5, 0), Color3.fromRGB(176, 166, 140), Enum.Material.Fabric)
	end
	Build.box(blades, Vector3.new(1.2, 1.2, 1), hub * CFrame.new(0, 0, -1.6), C.Iron, Enum.Material.Metal)
	blades.WorldPivot = hub * CFrame.new(0, 0, -1.6)
	blades:SetAttribute("Speed", 0.5)
	CollectionService:AddTag(blades, "Spin")
	return model
end

---------------------------------------------------------------------------------
-- Natureza e objetos de fazenda
---------------------------------------------------------------------------------

function Build.tree(parent: Instance, pos: Vector3, rng: Random, kind: string?)
	local model = Build.model("Arvore", parent)
	local k = kind or (if rng:NextNumber() < 0.55 then "dead" else "leafy")
	local h = rng:NextNumber(10, 20)
	local trunkCol = if k == "dead" then Color3.fromRGB(52, 44, 38) else C.Wood
	Build.cyl(model, CFrame.new(pos + Vector3.new(0, h / 2, 0)) * CFrame.Angles(rng:NextNumber(-0.05, 0.05), 0, rng:NextNumber(-0.05, 0.05)), h, rng:NextNumber(1.4, 2.4), trunkCol, Enum.Material.Wood)
	if k == "dead" then
		for _ = 1, rng:NextInteger(3, 5) do
			local y = rng:NextNumber(h * 0.45, h * 0.95)
			local ang = rng:NextNumber(0, math.pi * 2)
			local len = rng:NextNumber(3, 7)
			local from = pos + Vector3.new(0, y, 0)
			local to = from + Vector3.new(math.cos(ang) * len, rng:NextNumber(1.5, 4), math.sin(ang) * len)
			Build.beam(model, from, to, rng:NextNumber(0.4, 0.8), trunkCol, Enum.Material.Wood)
			local to2 = to + Vector3.new(math.cos(ang + 0.7) * len * 0.4, rng:NextNumber(0.5, 2), math.sin(ang + 0.7) * len * 0.4)
			Build.beam(model, to, to2, 0.3, trunkCol, Enum.Material.Wood)
		end
	elseif k == "pine" then
		for i = 0, 3 do
			local s = 10 - i * 2.2
			Build.box(model, Vector3.new(s, 3, s), CFrame.new(pos + Vector3.new(0, h * 0.4 + i * 2.6, 0)) * CFrame.Angles(0, rng:NextNumber(0, 1.5), 0), Color3.fromRGB(28, 44, 32), Enum.Material.Grass)
		end
	else
		local leaves = if rng:NextNumber() < 0.5 then C.Leaves else C.DeadLeaves
		for _ = 1, rng:NextInteger(2, 4) do
			local off = Vector3.new(rng:NextNumber(-3, 3), h + rng:NextNumber(-2, 2), rng:NextNumber(-3, 3))
			Build.ball(model, pos + off, rng:NextNumber(6, 10), leaves, Enum.Material.Grass)
		end
	end
	return model
end

function Build.rock(parent: Instance, pos: Vector3, rng: Random, scale: number?)
	local s = scale or 1
	return Build.box(
		parent,
		Vector3.new(rng:NextNumber(2, 6), rng:NextNumber(1.5, 4), rng:NextNumber(2, 6)) * s,
		CFrame.new(pos) * CFrame.Angles(rng:NextNumber(-0.4, 0.4), rng:NextNumber(0, 6), rng:NextNumber(-0.4, 0.4)),
		Color3.fromRGB(86, 86, 90),
		Enum.Material.Slate
	)
end

function Build.log(parent: Instance, pos: Vector3, rng: Random)
	local cf = CFrame.new(pos + Vector3.new(0, 0.9, 0)) * CFrame.Angles(0, rng:NextNumber(0, math.pi), 0)
	return Build.cylX(parent, cf, rng:NextNumber(7, 12), 1.8, C.DarkWood, Enum.Material.Wood)
end

function Build.haybale(parent: Instance, cf: CFrame, stacked: boolean?)
	local model = Build.model("Feno", parent)
	Build.cylX(model, cf * CFrame.new(0, 2, 0), 5, 4, C.Hay, Enum.Material.Fabric)
	if stacked then
		Build.cylX(model, cf * CFrame.new(0, 5.8, 0), 5, 4, C.Hay, Enum.Material.Fabric)
	end
	return model
end

-- Bloco de feno retangular (bom para criar cobertura)
function Build.hayblock(parent: Instance, cf: CFrame, layers: number?)
	local model = Build.model("FenoBloco", parent)
	for i = 0, (layers or 1) - 1 do
		Build.box(model, Vector3.new(6, 3, 3.5), cf * CFrame.new(0, 1.5 + i * 3, 0) * CFrame.Angles(0, (i % 2) * 0.15, 0), C.Hay, Enum.Material.Fabric)
	end
	return model
end

function Build.pumpkin(parent: Instance, pos: Vector3, lit: boolean?, scale: number?)
	local s = scale or 1
	local model = Build.model("Abobora", parent)
	local body = Build.ellipsoid(model, Vector3.new(3, 2.2, 3) * s, CFrame.new(pos + Vector3.new(0, 1.1 * s, 0)), C.Pumpkin, Enum.Material.SmoothPlastic)
	Build.cyl(model, CFrame.new(pos + Vector3.new(0, 2.4 * s, 0)), 0.8 * s, 0.4 * s, Color3.fromRGB(60, 70, 30), Enum.Material.Wood)
	if lit then
		local face = CFrame.new(pos + Vector3.new(0, 1.2 * s, 0)) * CFrame.Angles(0, math.random() * math.pi * 2, 0)
		for _, x in { -0.55, 0.55 } do
			Build.box(model, Vector3.new(0.5, 0.5, 0.2) * s, face * CFrame.new(x * s, 0.35 * s, -1.42 * s) * CFrame.Angles(0, 0, math.rad(45)), Color3.fromRGB(255, 190, 70), Enum.Material.Neon)
		end
		Build.box(model, Vector3.new(1.3, 0.3, 0.2) * s, face * CFrame.new(0, -0.35 * s, -1.42 * s), Color3.fromRGB(255, 190, 70), Enum.Material.Neon)
		Build.light(body, Color3.fromRGB(255, 140, 40), 12, 1.2, true)
	end
	return model
end

function Build.lamp(parent: Instance, pos: Vector3, color: Color3?, height: number?)
	local model = Build.model("Poste", parent)
	local h = height or 11
	Build.cyl(model, CFrame.new(pos + Vector3.new(0, h / 2, 0)), h, 0.6, C.Iron, Enum.Material.CorrodedMetal)
	Build.box(model, Vector3.new(0.4, 0.4, 2.4), CFrame.new(pos + Vector3.new(0, h - 0.2, -1)), C.Iron, Enum.Material.CorrodedMetal)
	local bulb = Build.box(model, Vector3.new(1.1, 1.4, 1.1), CFrame.new(pos + Vector3.new(0, h - 1.2, -2)), color or C.LampLight, Enum.Material.Neon)
	Build.box(model, Vector3.new(1.5, 0.3, 1.5), CFrame.new(pos + Vector3.new(0, h - 0.35, -2)), C.Iron, Enum.Material.Metal)
	Build.light(bulb, color or C.LampLight, 26, 1.6, true)
	return model
end

function Build.scarecrow(parent: Instance, cf: CFrame)
	local model = Build.model("Espantalho", parent)
	Build.box(model, Vector3.new(0.6, 9, 0.6), cf * CFrame.new(0, 4.5, 0), C.DarkWood, Enum.Material.Wood)
	Build.box(model, Vector3.new(7, 0.5, 0.5), cf * CFrame.new(0, 6.6, 0), C.DarkWood, Enum.Material.Wood)
	Build.box(model, Vector3.new(3, 3, 1.4), cf * CFrame.new(0, 5.8, 0), Color3.fromRGB(70, 60, 80), Enum.Material.Fabric)
	Build.box(model, Vector3.new(6.4, 1.1, 1.2), cf * CFrame.new(0, 6.6, 0), Color3.fromRGB(70, 60, 80), Enum.Material.Fabric)
	Build.ellipsoid(model, Vector3.new(2, 2.2, 2), cf * CFrame.new(0, 8.4, 0), C.Burlap, Enum.Material.Fabric)
	for _, x in { -0.4, 0.4 } do
		Build.box(model, Vector3.new(0.3, 0.3, 0.1), cf * CFrame.new(x, 8.6, -0.98), Color3.fromRGB(255, 40, 30), Enum.Material.Neon)
	end
	Build.box(model, Vector3.new(1, 0.08, 0.1), cf * CFrame.new(0, 8.0, -0.98), Color3.fromRGB(30, 20, 15), Enum.Material.Fabric)
	Build.cyl(model, cf * CFrame.new(0, 9.4, 0), 0.2, 3.4, C.Hay, Enum.Material.Fabric)
	Build.cyl(model, cf * CFrame.new(0, 9.9, 0), 1, 1.5, C.Hay, Enum.Material.Fabric)
	-- palha saindo das mangas
	for _, x in { -3.4, 3.4 } do
		Build.box(model, Vector3.new(0.8, 0.9, 0.9), cf * CFrame.new(x, 6.4, 0) * CFrame.Angles(0, 0, 0.4), C.Hay, Enum.Material.Grass)
	end
	return model
end

function Build.tombstone(parent: Instance, cf: CFrame, rng: Random)
	local model = Build.model("Tumulo", parent)
	local col = Color3.fromRGB(rng:NextInteger(78, 110), rng:NextInteger(78, 110), rng:NextInteger(82, 112))
	local tilt = CFrame.Angles(rng:NextNumber(-0.12, 0.12), 0, rng:NextNumber(-0.1, 0.1))
	if rng:NextNumber() < 0.25 then
		Build.box(model, Vector3.new(0.7, 4.2, 0.7), cf * CFrame.new(0, 2.1, 0) * tilt, col, Enum.Material.Slate)
		Build.box(model, Vector3.new(2.6, 0.7, 0.7), cf * tilt * CFrame.new(0, 3.1, 0), col, Enum.Material.Slate)
	else
		Build.box(model, Vector3.new(2.6, 2.8, 0.8), cf * CFrame.new(0, 1.4, 0) * tilt, col, Enum.Material.Slate)
		Build.part({
			Parent = model,
			Shape = Enum.PartType.Cylinder,
			Size = Vector3.new(0.8, 2.6, 2.6),
			CFrame = cf * CFrame.new(0, 2.8, 0) * tilt * CFrame.Angles(0, math.rad(90), 0),
			Color = col,
			Material = Enum.Material.Slate,
		})
	end
	-- monte de terra
	Build.box(model, Vector3.new(2.8, 0.5, 5.5), cf * CFrame.new(0, 0.25, 3.2), Color3.fromRGB(60, 46, 36), Enum.Material.Ground)
	return model
end

-- Plantação em fileiras. kind = "wheat" (trigo) ou "corn" (milho)
function Build.crops(parent: Instance, cf: CFrame, w: number, d: number, kind: string?, rowGap: number?)
	local model = Build.model("Plantacao", parent)
	local corn = kind == "corn"
	local gap = rowGap or (if corn then 4 else 3)
	local h = if corn then 8 else 3.2
	local seg = if corn then 8 else 4
	local rows = math.max(1, math.floor(w / gap))
	for r = 0, rows - 1 do
		local x = -w / 2 + (r + 0.5) * (w / rows)
		local segs = math.max(1, math.floor(d / seg))
		for s = 0, segs - 1 do
			local z = -d / 2 + (s + 0.5) * (d / segs)
			local hh = h * (0.85 + ((r * 7 + s * 13) % 5) * 0.06)
			Build.box(model, Vector3.new(if corn then 1.4 else 1.1, hh, d / segs - 0.5), cf * CFrame.new(x, hh / 2, z), if corn then C.Corn else C.Wheat, Enum.Material.Grass, {
				CanCollide = corn,
				CastShadow = corn,
			})
			if corn then
				Build.box(model, Vector3.new(0.8, 1, d / segs - 1), cf * CFrame.new(x, hh + 0.5, z), C.CornTop, Enum.Material.Grass, { CanCollide = false })
			end
		end
	end
	return model
end

function Build.tractor(parent: Instance, cf: CFrame)
	local model = Build.model("Trator", parent)
	local body = Color3.fromRGB(110, 34, 30)
	Build.box(model, Vector3.new(4, 3, 8), cf * CFrame.new(0, 3.5, 0), body, Enum.Material.CorrodedMetal)
	Build.box(model, Vector3.new(3.4, 2.4, 4), cf * CFrame.new(0, 3.9, -5.5), body, Enum.Material.CorrodedMetal)
	Build.box(model, Vector3.new(4.4, 0.3, 4.4), cf * CFrame.new(0, 8.6, 2), Color3.fromRGB(40, 40, 40), Enum.Material.Metal)
	for _, x in { -2, 2 } do
		Build.box(model, Vector3.new(0.3, 3.6, 0.3), cf * CFrame.new(x, 6.8, 0.2), C.Iron, Enum.Material.Metal)
		Build.box(model, Vector3.new(0.3, 3.6, 0.3), cf * CFrame.new(x, 6.8, 3.8), C.Iron, Enum.Material.Metal)
	end
	Build.cyl(model, cf * CFrame.new(1, 6.5, -6), 2.4, 0.4, C.Iron, Enum.Material.Metal)
	for _, x in { -2.8, 2.8 } do
		Build.cylX(model, cf * CFrame.new(x, 3, 2), 1.4, 6, Color3.fromRGB(26, 26, 26), Enum.Material.Rubber)
		Build.cylX(model, cf * CFrame.new(x * 0.85, 1.4, -5.5), 1, 2.8, Color3.fromRGB(26, 26, 26), Enum.Material.Rubber)
	end
	return model
end

function Build.well(parent: Instance, pos: Vector3)
	local model = Build.model("Poco", parent)
	for i = 0, 7 do
		local a = i * math.pi / 4
		Build.box(model, Vector3.new(2.6, 3, 1), CFrame.new(pos) * CFrame.Angles(0, a, 0) * CFrame.new(0, 1.5, -3), Build.Colors.Stone, Enum.Material.Cobblestone)
	end
	Build.box(model, Vector3.new(5.4, 0.2, 5.4), CFrame.new(pos + Vector3.new(0, 0.5, 0)), Color3.fromRGB(10, 12, 16), Enum.Material.Slate)
	for _, x in { -3.2, 3.2 } do
		Build.box(model, Vector3.new(0.6, 7, 0.6), CFrame.new(pos + Vector3.new(x, 3.5, 0)), C.DarkWood, Enum.Material.Wood)
	end
	Build.cylX(model, CFrame.new(pos + Vector3.new(0, 5.6, 0)), 6.4, 0.6, C.Wood, Enum.Material.Wood)
	Build.roof(model, CFrame.new(pos + Vector3.new(0, 7, 0)) * CFrame.Angles(0, math.rad(90), 0), 6, 8, 2.5, C.DarkWood, Enum.Material.WoodPlanks, 0.5)
	Build.box(model, Vector3.new(1, 1.2, 1), CFrame.new(pos + Vector3.new(0, 3.6, 0)), C.Wood, Enum.Material.Wood)
	return model
end

function Build.crate(parent: Instance, cf: CFrame, size: number?)
	local s = size or 3
	return Build.box(parent, Vector3.new(s, s, s), cf * CFrame.new(0, s / 2, 0), C.Wood, Enum.Material.WoodPlanks)
end

function Build.barrel(parent: Instance, pos: Vector3)
	local model = Build.model("Barril", parent)
	Build.cyl(model, CFrame.new(pos + Vector3.new(0, 1.6, 0)), 3.2, 2.4, C.Wood, Enum.Material.Wood)
	for _, y in { 0.5, 2.7 } do
		Build.cyl(model, CFrame.new(pos + Vector3.new(0, y, 0)), 0.25, 2.5, C.Iron, Enum.Material.Metal)
	end
	return model
end

-- Placa de madeira com texto
function Build.sign(parent: Instance, cf: CFrame, text: string, width: number?)
	local model = Build.model("Placa", parent)
	local w = width or 6
	Build.box(model, Vector3.new(0.5, 4, 0.5), cf * CFrame.new(0, 2, 0.3), C.DarkWood, Enum.Material.Wood)
	local board = Build.box(model, Vector3.new(w, 2, 0.3), cf * CFrame.new(0, 4, 0), C.OldWood, Enum.Material.WoodPlanks)
	local gui = Instance.new("SurfaceGui")
	gui.Face = Enum.NormalId.Front
	gui.CanvasSize = Vector2.new(w * 50, 100)
	gui.LightInfluence = 1
	gui.Parent = board
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Text = text
	label.TextScaled = true
	label.Font = Enum.Font.Creepster
	label.TextColor3 = Color3.fromRGB(70, 10, 10)
	label.Parent = gui
	return model
end

function Build.cart(parent: Instance, cf: CFrame)
	local model = Build.model("Carroca", parent)
	Build.box(model, Vector3.new(5, 0.5, 8), cf * CFrame.new(0, 2.2, 0), C.OldWood, Enum.Material.WoodPlanks)
	for _, x in { -2.4, 2.4 } do
		Build.box(model, Vector3.new(0.3, 1.6, 8), cf * CFrame.new(x, 3.2, 0), C.OldWood, Enum.Material.WoodPlanks)
		Build.cylX(model, cf * CFrame.new(x * 1.1, 1.8, 2), 0.5, 3.6, C.DarkWood, Enum.Material.Wood)
	end
	-- uma roda quebrada caída
	Build.cylX(model, cf * CFrame.new(-1, 0.3, -6) * CFrame.Angles(0, 0, math.rad(90)), 0.5, 3.6, C.DarkWood, Enum.Material.Wood)
	Build.box(model, Vector3.new(0.4, 0.4, 5), cf * CFrame.new(0, 1.4, -6), C.DarkWood, Enum.Material.Wood)
	return model
end

return Build
