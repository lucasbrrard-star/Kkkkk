-- Roles: sobrevivente x assassino. Velocidade, estamina, ataque e habilidades.
--
-- Sobrevivente: Shift = correr (gasta estamina) | Q = Lanterna (atordoa o assassino)
-- Assassino:    Clique/F = golpe de forcado | Q = Uivo (revela todos) | E = Investida

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local Remotes = require(Shared:WaitForChild("Remotes"))

local S = Config.Survivor
local K = Config.Killer
local ActionRemote = Remotes.get("Action")
local Notify = Remotes.get("Notify")
local Reveal = Remotes.get("Reveal")

local Roles = {}

type State = {
	character: Model,
	humanoid: Humanoid,
	player: Player?,
	role: string,
	stamina: number,
	sprinting: boolean,
	lastSprint: number,
	hurtUntil: number,
	stunnedUntil: number,
	frozenUntil: number,
	dashUntil: number,
	swinging: boolean,
	cd: { [string]: number },
	connections: { RBXScriptConnection },
}

local states: { [Model]: State } = {}

-- Chamado pelo RoundManager quando um sobrevivente morre
Roles.onSurvivorDied = nil :: ((player: Player?, character: Model) -> ())?

local function now(): number
	return os.clock()
end

local function newState(character: Model, humanoid: Humanoid, player: Player?, role: string): State
	return {
		character = character,
		humanoid = humanoid,
		player = player,
		role = role,
		stamina = S.MaxStamina,
		sprinting = false,
		lastSprint = 0,
		hurtUntil = 0,
		stunnedUntil = 0,
		frozenUntil = 0,
		dashUntil = 0,
		swinging = false,
		cd = {},
		connections = {},
	}
end

local function ready(st: State, name: string): boolean
	return now() >= (st.cd[name] or 0)
end

local function startCooldown(st: State, name: string, duration: number)
	st.cd[name] = now() + duration
	if st.player then
		st.player:SetAttribute("CD_" .. name, workspace:GetServerTimeNow() + duration)
		st.player:SetAttribute("CDMAX_" .. name, duration)
	end
end

local function clearCooldownAttributes(player: Player)
	for _, name in { "Attack", "Lantern", "Howl", "Dash" } do
		player:SetAttribute("CD_" .. name, nil)
		player:SetAttribute("CDMAX_" .. name, nil)
	end
end

local function rootOf(character: Model): BasePart?
	return character:FindFirstChild("HumanoidRootPart") :: BasePart?
end

local function alive(st: State?): boolean
	return st ~= nil and st.character.Parent ~= nil and st.humanoid.Health > 0
end

function Roles.getKiller(): State?
	for _, st in states do
		if st.role == "Killer" and alive(st) then
			return st
		end
	end
	return nil
end

function Roles.survivors(): { State }
	local out = {}
	for _, st in states do
		if st.role == "Survivor" and alive(st) then
			table.insert(out, st)
		end
	end
	return out
end

function Roles.stateOf(character: Model): State?
	return states[character]
end

---------------------------------------------------------------------------------
-- Visual do assassino: "O Espantalho" (saco de estopa, chapéu de palha e forcado)
---------------------------------------------------------------------------------
local function weldPart(parent: Instance, attach: BasePart, props: { [string]: any }): BasePart
	local p = Instance.new(props.ClassName or "Part") :: BasePart
	p.Anchored = false
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.Massless = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	for k, v in props do
		if k ~= "ClassName" and k ~= "Mesh" then
			(p :: any)[k] = v
		end
	end
	if props.Mesh then
		local mesh = Instance.new("SpecialMesh")
		mesh.MeshType = props.Mesh
		mesh.Parent = p
	end
	p.Parent = parent
	local weld = Instance.new("WeldConstraint")
	weld.Part0 = attach
	weld.Part1 = p
	weld.Parent = p
	return p
end

local function dressKiller(character: Model)
	for _, d in character:GetChildren() do
		if d:IsA("Accessory") or d:IsA("Shirt") or d:IsA("Pants") or d:IsA("ShirtGraphic") or d:IsA("BodyColors") then
			d:Destroy()
		end
	end
	local torsoColor = Color3.fromRGB(70, 58, 78)
	local legColor = Color3.fromRGB(52, 42, 34)
	local skin = Color3.fromRGB(150, 120, 80)
	for _, part in character:GetChildren() do
		if part:IsA("BasePart") and part.Name ~= "HumanoidRootPart" then
			local n = part.Name
			if n:find("Leg") or n:find("Foot") then
				part.Color = legColor
			elseif n:find("Hand") or n == "Head" then
				part.Color = skin
			else
				part.Color = torsoColor
			end
			part.Material = Enum.Material.Fabric
			for _, child in part:GetChildren() do
				if child:IsA("SurfaceAppearance") then
					child:Destroy()
				end
			end
			if part:IsA("MeshPart") then
				pcall(function()
					part.TextureID = ""
				end)
			end
		end
	end

	local head = character:FindFirstChild("Head") :: BasePart?
	if head then
		for _, d in head:GetChildren() do
			if d:IsA("Decal") then
				d:Destroy()
			end
		end
		head.Transparency = 1
		local acc = Instance.new("Model")
		acc.Name = "Cabeca"
		acc.Parent = character
		local hcf = head.CFrame
		weldPart(acc, head, { Name = "Saco", Size = Vector3.new(1.6, 1.75, 1.6), CFrame = hcf * CFrame.new(0, 0.1, 0), Color = Color3.fromRGB(150, 122, 82), Material = Enum.Material.Fabric, Mesh = Enum.MeshType.Sphere })
		for _, x in { -0.3, 0.3 } do
			local eye = weldPart(acc, head, { Name = "Olho", Shape = Enum.PartType.Ball, Size = Vector3.new(0.26, 0.26, 0.26), CFrame = hcf * CFrame.new(x, 0.25, -0.74), Color = Color3.fromRGB(255, 30, 20), Material = Enum.Material.Neon })
			if x > 0 then
				local l = Instance.new("PointLight")
				l.Color = Color3.fromRGB(255, 30, 20)
				l.Range = 7
				l.Brightness = 2
				l.Parent = eye
			end
		end
		-- boca costurada
		weldPart(acc, head, { Name = "Boca", Size = Vector3.new(0.9, 0.07, 0.05), CFrame = hcf * CFrame.new(0, -0.3, -0.78), Color = Color3.fromRGB(30, 18, 12), Material = Enum.Material.Fabric })
		for i = -2, 2 do
			weldPart(acc, head, { Name = "Ponto", Size = Vector3.new(0.05, 0.22, 0.05), CFrame = hcf * CFrame.new(i * 0.18, -0.3, -0.79), Color = Color3.fromRGB(30, 18, 12), Material = Enum.Material.Fabric })
		end
		-- corda no pescoço
		weldPart(acc, head, { Name = "Corda", Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.18, 1.4, 1.4), CFrame = hcf * CFrame.new(0, -0.7, 0) * CFrame.Angles(0, 0, math.rad(90)), Color = Color3.fromRGB(120, 96, 60), Material = Enum.Material.Fabric })
		-- chapéu de palha
		local tilt = hcf * CFrame.Angles(0, 0, math.rad(8))
		weldPart(acc, head, { Name = "Aba", Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.14, 3.2, 3.2), CFrame = tilt * CFrame.new(0, 0.95, 0) * CFrame.Angles(0, 0, math.rad(90)), Color = Color3.fromRGB(176, 146, 80), Material = Enum.Material.Fabric })
		weldPart(acc, head, { Name = "Copa", Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.9, 1.5, 1.5), CFrame = tilt * CFrame.new(0, 1.45, 0) * CFrame.Angles(0, 0, math.rad(90)), Color = Color3.fromRGB(168, 138, 74), Material = Enum.Material.Fabric })
	end

	-- palha saindo dos pulsos
	for _, n in { "RightHand", "LeftHand", "Right Arm", "Left Arm" } do
		local hand = character:FindFirstChild(n) :: BasePart?
		if hand then
			local y = if n:find("Arm") then -0.9 else 0.1
			weldPart(character, hand, { Name = "Palha", Size = Vector3.new(0.9, 0.5, 0.9), CFrame = hand.CFrame * CFrame.new(0, y, 0) * CFrame.Angles(0, 0.5, 0.3), Color = Color3.fromRGB(196, 160, 80), Material = Enum.Material.Grass })
		end
	end

	-- forcado na mão direita
	local hand = character:FindFirstChild("RightHand") or character:FindFirstChild("Right Arm")
	if hand and hand:IsA("BasePart") then
		local grip = hand.CFrame
		if hand.Name == "Right Arm" then
			grip = grip * CFrame.new(0, -1, 0)
		end
		local dir = Vector3.new(0, -0.5, -0.866)
		local f = grip * CFrame.fromMatrix(Vector3.zero, Vector3.new(1, 0, 0), dir)
		local fork = Instance.new("Model")
		fork.Name = "Forcado"
		fork.Parent = character
		local rust = Color3.fromRGB(70, 60, 56)
		weldPart(fork, hand, { Name = "Cabo", Shape = Enum.PartType.Cylinder, Size = Vector3.new(6.5, 0.28, 0.28), CFrame = f * CFrame.new(0, 0.75, 0) * CFrame.Angles(0, 0, math.rad(90)), Color = Color3.fromRGB(80, 56, 36), Material = Enum.Material.Wood })
		weldPart(fork, hand, { Name = "Travessa", Size = Vector3.new(1.7, 0.22, 0.22), CFrame = f * CFrame.new(0, 4.05, 0), Color = rust, Material = Enum.Material.CorrodedMetal })
		for _, x in { -0.75, 0, 0.75 } do
			weldPart(fork, hand, { Name = "Dente", Size = Vector3.new(0.14, 1.9, 0.14), CFrame = f * CFrame.new(x, 5, 0), Color = rust, Material = Enum.Material.CorrodedMetal })
		end
	end
end

---------------------------------------------------------------------------------
-- Animação simples do golpe (gira o ombro direito)
---------------------------------------------------------------------------------
local function shoulderOf(character: Model): (Motor6D?, boolean)
	local upper = character:FindFirstChild("RightUpperArm")
	if upper then
		return upper:FindFirstChild("RightShoulder") :: Motor6D?, true
	end
	local torso = character:FindFirstChild("Torso")
	if torso then
		return torso:FindFirstChild("Right Shoulder") :: Motor6D?, false
	end
	return nil, false
end

local function swing(st: State)
	local motor, r15 = shoulderOf(st.character)
	if not motor or st.swinging then
		return
	end
	st.swinging = true
	local base = motor.C0
	local function rot(a: number): CFrame
		return if r15 then base * CFrame.Angles(a, 0, 0) else base * CFrame.Angles(0, 0, a)
	end
	local t1 = TweenService:Create(motor, TweenInfo.new(0.1, Enum.EasingStyle.Quad), { C0 = rot(2.5) })
	local t2 = TweenService:Create(motor, TweenInfo.new(0.12, Enum.EasingStyle.Quad, Enum.EasingDirection.In), { C0 = rot(0.9) })
	local t3 = TweenService:Create(motor, TweenInfo.new(0.3, Enum.EasingStyle.Sine), { C0 = base })
	t1:Play()
	t1.Completed:Once(function()
		t2:Play()
	end)
	t2.Completed:Once(function()
		t3:Play()
	end)
	t3.Completed:Once(function()
		st.swinging = false
	end)
	task.delay(1, function()
		st.swinging = false
	end)
end

local function playSound(parent: Instance, id: string, volume: number?)
	if id == "" then
		return
	end
	local s = Instance.new("Sound")
	s.SoundId = id
	s.Volume = volume or 1
	s.RollOffMaxDistance = 120
	s.Parent = parent
	s:Play()
	s.Ended:Once(function()
		s:Destroy()
	end)
	task.delay(5, function()
		if s.Parent then
			s:Destroy()
		end
	end)
end

---------------------------------------------------------------------------------
-- Ações
---------------------------------------------------------------------------------
function Roles.attack(character: Model)
	local st = states[character]
	if not st or st.role ~= "Killer" or not alive(st) then
		return
	end
	local t = now()
	if not ready(st, "Attack") or t < st.stunnedUntil or t < st.frozenUntil then
		return
	end
	startCooldown(st, "Attack", K.AttackCooldown)
	swing(st)
	local root = rootOf(character)
	if root then
		playSound(root, Config.Sounds.Attack, 0.8)
	end
	task.delay(0.2, function()
		local r = rootOf(character)
		if not r or not alive(st) then
			return
		end
		for _, target in Roles.survivors() do
			local tr = rootOf(target.character)
			if tr then
				local offset = tr.Position - r.Position
				if offset.Magnitude <= K.AttackRange then
					local flat = Vector3.new(offset.X, 0, offset.Z)
					local facing = if flat.Magnitude > 0.5 then r.CFrame.LookVector:Dot(flat.Unit) else 1
					if facing > 0.15 then
						target.humanoid:TakeDamage(K.AttackDamage)
						target.hurtUntil = now() + S.HurtBoostTime
						if target.player then
							Notify:FireClient(target.player, "Você foi atingido! CORRA!", Color3.fromRGB(255, 60, 50))
						end
					end
				end
			end
		end
	end)
end

function Roles.dash(character: Model)
	local st = states[character]
	if not st or st.role ~= "Killer" or not alive(st) then
		return
	end
	if not ready(st, "Dash") or now() < st.frozenUntil or now() < st.stunnedUntil then
		return
	end
	startCooldown(st, "Dash", K.DashCooldown)
	st.dashUntil = now() + K.DashTime
end

function Roles.howl(character: Model)
	local st = states[character]
	if not st or st.role ~= "Killer" or not alive(st) then
		return
	end
	if not ready(st, "Howl") or now() < st.frozenUntil then
		return
	end
	startCooldown(st, "Howl", K.HowlCooldown)
	local targets = {}
	for _, s in Roles.survivors() do
		table.insert(targets, s.character)
		if s.player then
			Notify:FireClient(s.player, "O Espantalho farejou você...", Color3.fromRGB(255, 80, 60))
		end
	end
	if st.player then
		Reveal:FireClient(st.player, targets, K.HowlDuration)
	end
end

function Roles.lantern(character: Model)
	local st = states[character]
	if not st or st.role ~= "Survivor" or not alive(st) then
		return
	end
	if not ready(st, "Lantern") then
		return
	end
	startCooldown(st, "Lantern", S.LanternCooldown)
	local head = character:FindFirstChild("Head") :: BasePart?
	if head then
		local flash = Instance.new("SpotLight")
		flash.Brightness = 12
		flash.Range = S.LanternRange + 6
		flash.Angle = 70
		flash.Color = Color3.fromRGB(255, 250, 220)
		flash.Face = Enum.NormalId.Front
		flash.Parent = head
		task.delay(0.35, function()
			flash:Destroy()
		end)
	end
	local killer = Roles.getKiller()
	local root = rootOf(character)
	if not killer or not root then
		return
	end
	local kroot = rootOf(killer.character)
	if not kroot then
		return
	end
	local offset = kroot.Position - root.Position
	if offset.Magnitude > S.LanternRange then
		return
	end
	local flat = Vector3.new(offset.X, 0, offset.Z)
	if flat.Magnitude > 0.5 and root.CFrame.LookVector:Dot(flat.Unit) < 0.55 then
		return
	end
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.FilterDescendantsInstances = { character, killer.character }
	if workspace:Raycast(root.Position, offset, params) then
		return -- tem uma parede no caminho
	end
	killer.stunnedUntil = now() + S.LanternStun
	killer.character:SetAttribute("Stunned", true)
	task.delay(S.LanternStun, function()
		if killer.character.Parent then
			killer.character:SetAttribute("Stunned", false)
		end
	end)
	if st.player then
		Notify:FireClient(st.player, "Você cegou o Espantalho! Fuja!", Color3.fromRGB(255, 240, 160))
	end
	if killer.player then
		Notify:FireClient(killer.player, "Você foi cegado pela lanterna!", Color3.fromRGB(255, 240, 160))
	end
end

---------------------------------------------------------------------------------
-- Montar papéis
---------------------------------------------------------------------------------
local function register(character: Model, player: Player?, role: string): State?
	local humanoid = character:FindFirstChildOfClass("Humanoid")
	if not humanoid then
		return nil
	end
	local st = newState(character, humanoid, player, role)
	states[character] = st
	if player then
		player:SetAttribute("Role", role)
		player:SetAttribute("Stamina", S.MaxStamina)
		clearCooldownAttributes(player)
	end
	table.insert(st.connections, humanoid.Died:Connect(function()
		if role == "Survivor" then
			if player then
				player:SetAttribute("Role", "Lobby")
			end
			states[character] = nil
			if Roles.onSurvivorDied then
				Roles.onSurvivorDied(player, character)
			end
		end
	end))
	return st
end

function Roles.makeSurvivor(player: Player): boolean
	local character = player.Character
	if not character then
		return false
	end
	local st = register(character, player, "Survivor")
	if not st then
		return false
	end
	st.humanoid.MaxHealth = S.Health
	st.humanoid.Health = S.Health
	st.humanoid.WalkSpeed = S.WalkSpeed
	return true
end

function Roles.makeKiller(character: Model, player: Player?): boolean
	local st = register(character, player, "Killer")
	if not st then
		return false
	end
	dressKiller(character)
	st.humanoid.MaxHealth = 1e6
	st.humanoid.Health = 1e6
	st.humanoid.WalkSpeed = K.WalkSpeed
	st.humanoid.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
	st.humanoid.HealthDisplayType = Enum.HumanoidHealthDisplayType.AlwaysOff
	CollectionService:AddTag(character, "KillerCharacter")
	return true
end

function Roles.freezeKiller(seconds: number)
	local k = Roles.getKiller()
	if k then
		k.frozenUntil = now() + seconds
		k.character:SetAttribute("Frozen", true)
		task.delay(seconds, function()
			if k.character.Parent then
				k.character:SetAttribute("Frozen", false)
			end
		end)
	end
end

-- Volta todo mundo ao estado de lobby
function Roles.reset()
	for character, st in states do
		for _, c in st.connections do
			c:Disconnect()
		end
		CollectionService:RemoveTag(character, "KillerCharacter")
	end
	table.clear(states)
	for _, p in Players:GetPlayers() do
		p:SetAttribute("Role", "Lobby")
		p:SetAttribute("Stamina", nil)
		clearCooldownAttributes(p)
	end
end

function Roles.forget(character: Model)
	local st = states[character]
	if st then
		for _, c in st.connections do
			c:Disconnect()
		end
		states[character] = nil
	end
end

---------------------------------------------------------------------------------
-- Loop de movimento
---------------------------------------------------------------------------------
RunService.Heartbeat:Connect(function(dt)
	local t = now()
	for character, st in states do
		if not character.Parent then
			states[character] = nil
			continue
		end
		local hum = st.humanoid
		if hum.Health <= 0 then
			continue
		end
		local speed
		if st.role == "Survivor" then
			local moving = hum.MoveDirection.Magnitude > 0.1
			if st.sprinting and moving and st.stamina > 0 then
				st.stamina = math.max(0, st.stamina - S.StaminaDrain * dt)
				st.lastSprint = t
				speed = S.SprintSpeed
			else
				if t - st.lastSprint > S.RegenDelay then
					st.stamina = math.min(S.MaxStamina, st.stamina + S.StaminaRegen * dt)
				end
				speed = S.WalkSpeed
			end
			if t < st.hurtUntil then
				speed = math.max(speed, S.HurtBoostSpeed)
			end
			if st.player then
				local rounded = math.floor(st.stamina + 0.5)
				if st.player:GetAttribute("Stamina") ~= rounded then
					st.player:SetAttribute("Stamina", rounded)
				end
			end
		else
			if t < st.frozenUntil or t < st.stunnedUntil then
				speed = 0
			elseif t < st.dashUntil then
				speed = K.DashSpeed
			else
				speed = K.WalkSpeed
			end
		end
		if hum.WalkSpeed ~= speed then
			hum.WalkSpeed = speed
		end
	end
end)

-- Ações vindas dos clientes
ActionRemote.OnServerEvent:Connect(function(player: Player, action: any, value: any)
	if typeof(action) ~= "string" then
		return
	end
	local character = player.Character
	if not character then
		return
	end
	local st = states[character]
	if not st then
		return
	end
	if action == "Sprint" then
		st.sprinting = value == true
	elseif action == "Attack" then
		Roles.attack(character)
	elseif action == "Ability1" then
		if st.role == "Killer" then
			Roles.howl(character)
		else
			Roles.lantern(character)
		end
	elseif action == "Ability2" then
		if st.role == "Killer" then
			Roles.dash(character)
		end
	end
end)

return Roles
