-- Generators: o objetivo dos sobreviventes. Cada gerador consertado tira tempo do relógio.

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Build = require(script.Parent.Build)
local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local Remotes = require(Shared:WaitForChild("Remotes"))

local Notify = Remotes.get("Notify")
local G = Config.Generator

local Generators = {}

export type Gen = {
	model: Model,
	progress: number,
	done: boolean,
	prompt: ProximityPrompt,
	fill: Frame,
	label: TextLabel,
	lamp: BasePart,
}

local function create(parent: Instance, cf: CFrame, index: number): Gen
	local model = Build.model("Gerador" .. index, parent)
	Build.box(model, Vector3.new(5.4, 0.8, 3.8), cf * CFrame.new(0, 0.4, 0), Color3.fromRGB(40, 40, 44), Enum.Material.DiamondPlate)
	local body = Build.box(model, Vector3.new(4.6, 3.4, 3), cf * CFrame.new(0, 2.5, 0), Color3.fromRGB(150, 120, 40), Enum.Material.CorrodedMetal)
	body.Name = "Corpo"
	Build.box(model, Vector3.new(2.2, 1.4, 0.2), cf * CFrame.new(-0.6, 2.8, -1.55), Color3.fromRGB(30, 30, 30), Enum.Material.Metal)
	Build.cyl(model, cf * CFrame.new(1.6, 4.8, 0.6), 1.6, 0.6, Color3.fromRGB(50, 50, 50), Enum.Material.Metal)
	for _, x in { -2.4, 2.4 } do
		Build.box(model, Vector3.new(0.3, 3.8, 3.2), cf * CFrame.new(x, 2.3, 0), Color3.fromRGB(46, 46, 50), Enum.Material.Metal)
	end
	-- fios
	for i = 0, 2 do
		Build.beam(model, (cf * CFrame.new(-1.8 + i * 0.4, 0.8, 1.5)).Position, (cf * CFrame.new(-2.5 + i * 1.5, 0.15, 4.5)).Position, 0.15, Color3.fromRGB(20, 20, 20), Enum.Material.Rubber)
	end
	local lamp = Build.ball(model, (cf * CFrame.new(-1.4, 4.5, 0)).Position, 0.9, Color3.fromRGB(255, 40, 30), Enum.Material.Neon)
	Build.light(lamp, Color3.fromRGB(255, 50, 40), 12, 1.2)

	local prompt = Instance.new("ProximityPrompt")
	prompt.ActionText = "Consertar"
	prompt.ObjectText = "Gerador"
	prompt.HoldDuration = G.HoldDuration
	prompt.MaxActivationDistance = 8
	prompt.RequiresLineOfSight = false
	prompt.KeyboardKeyCode = Enum.KeyCode.E
	prompt.Parent = body
	CollectionService:AddTag(prompt, "GeneratorPrompt")

	local bb = Instance.new("BillboardGui")
	bb.Size = UDim2.fromOffset(120, 34)
	bb.StudsOffset = Vector3.new(0, 4.5, 0)
	bb.MaxDistance = 60
	bb.AlwaysOnTop = false
	bb.Parent = body
	local back = Instance.new("Frame")
	back.Size = UDim2.new(1, 0, 0, 10)
	back.Position = UDim2.new(0, 0, 1, -10)
	back.BackgroundColor3 = Color3.fromRGB(20, 10, 10)
	back.BorderSizePixel = 0
	back.Parent = bb
	local fill = Instance.new("Frame")
	fill.Size = UDim2.fromScale(0, 1)
	fill.BackgroundColor3 = Color3.fromRGB(220, 60, 40)
	fill.BorderSizePixel = 0
	fill.Parent = back
	local label = Instance.new("TextLabel")
	label.Size = UDim2.new(1, 0, 1, -12)
	label.BackgroundTransparency = 1
	label.Font = Enum.Font.GothamBold
	label.TextScaled = true
	label.TextColor3 = Color3.fromRGB(240, 220, 200)
	label.TextStrokeTransparency = 0.4
	label.Text = "0%"
	label.Parent = bb

	return {
		model = model,
		progress = 0,
		done = false,
		prompt = prompt,
		fill = fill,
		label = label,
		lamp = lamp,
	}
end

-- Cria os geradores do mapa. onRepaired(gen, player, totalDone) é chamado a cada conserto.
function Generators.spawn(parent: Instance, cframes: { CFrame }, onRepaired: (Gen, Player, number) -> ())
	local folder = Instance.new("Folder")
	folder.Name = "Geradores"
	folder.Parent = parent
	local list: { Gen } = {}
	local doneCount = 0
	for i, cf in cframes do
		local gen = create(folder, cf, i)
		table.insert(list, gen)
		gen.prompt.Triggered:Connect(function(player: Player)
			if gen.done or player:GetAttribute("Role") ~= "Survivor" then
				return
			end
			gen.progress = math.min(100, gen.progress + G.StepPercent)
			gen.fill.Size = UDim2.fromScale(gen.progress / 100, 1)
			gen.label.Text = gen.progress .. "%"
			if gen.progress >= 100 then
				gen.done = true
				gen.prompt.Enabled = false
				gen.prompt:SetAttribute("Done", true)
				gen.fill.BackgroundColor3 = Color3.fromRGB(80, 220, 90)
				gen.label.Text = "CONSERTADO"
				gen.lamp.Color = Color3.fromRGB(80, 255, 90)
				local light = gen.lamp:FindFirstChildOfClass("PointLight")
				if light then
					light.Color = Color3.fromRGB(80, 255, 90)
					light.Range = 22
				end
				if Config.Sounds.GeneratorDone ~= "" then
					local s = Instance.new("Sound")
					s.SoundId = Config.Sounds.GeneratorDone
					s.Volume = 1
					s.RollOffMaxDistance = 200
					s.Parent = gen.lamp
					s:Play()
				end
				doneCount += 1
				onRepaired(gen, player, doneCount)
			end
		end)
	end
	return {
		list = list,
		total = #list,
		done = function()
			return doneCount
		end,
	}
end

-- Avisa todo mundo
function Generators.broadcast(text: string, color: Color3?)
	for _, p in Players:GetPlayers() do
		Notify:FireClient(p, text, color)
	end
end

return Generators
