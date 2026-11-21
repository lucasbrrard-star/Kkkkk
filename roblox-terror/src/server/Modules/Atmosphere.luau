-- Atmosphere: iluminação de terror (noite, neblina e cores) para o lobby e cada mapa.

local Lighting = game:GetService("Lighting")
local TweenService = game:GetService("TweenService")

local Atmosphere = {}

type Preset = {
	ClockTime: number,
	Brightness: number,
	Ambient: Color3,
	OutdoorAmbient: Color3,
	Density: number,
	Haze: number,
	AtmosColor: Color3,
	Decay: Color3,
	Tint: Color3,
	Saturation: number,
	Contrast: number,
}

local rgb = Color3.fromRGB

local PRESETS: { [string]: Preset } = {
	Lobby = {
		ClockTime = 0.3,
		Brightness = 1.4,
		Ambient = rgb(62, 56, 70),
		OutdoorAmbient = rgb(78, 72, 92),
		Density = 0.36,
		Haze = 1.8,
		AtmosColor = rgb(120, 115, 130),
		Decay = rgb(70, 55, 65),
		Tint = rgb(228, 222, 238),
		Saturation = -0.3,
		Contrast = 0.12,
	},
	Milharal = {
		ClockTime = 0,
		Brightness = 1.2,
		Ambient = rgb(58, 60, 44),
		OutdoorAmbient = rgb(72, 76, 56),
		Density = 0.42,
		Haze = 2.2,
		AtmosColor = rgb(130, 135, 100),
		Decay = rgb(70, 72, 40),
		Tint = rgb(232, 236, 200),
		Saturation = -0.25,
		Contrast = 0.15,
	},
	Celeiro = {
		ClockTime = 18.3,
		Brightness = 1.1,
		Ambient = rgb(70, 46, 42),
		OutdoorAmbient = rgb(96, 60, 52),
		Density = 0.38,
		Haze = 2.4,
		AtmosColor = rgb(150, 100, 90),
		Decay = rgb(110, 50, 40),
		Tint = rgb(240, 214, 205),
		Saturation = -0.15,
		Contrast = 0.18,
	},
	Vila = {
		ClockTime = 23.5,
		Brightness = 1.2,
		Ambient = rgb(56, 50, 72),
		OutdoorAmbient = rgb(70, 62, 96),
		Density = 0.45,
		Haze = 2.4,
		AtmosColor = rgb(100, 90, 130),
		Decay = rgb(60, 40, 80),
		Tint = rgb(218, 208, 238),
		Saturation = -0.3,
		Contrast = 0.15,
	},
	Cemiterio = {
		ClockTime = 1,
		Brightness = 1.5,
		Ambient = rgb(48, 56, 72),
		OutdoorAmbient = rgb(64, 76, 98),
		Density = 0.4,
		Haze = 2,
		AtmosColor = rgb(90, 105, 130),
		Decay = rgb(40, 50, 80),
		Tint = rgb(204, 216, 242),
		Saturation = -0.4,
		Contrast = 0.2,
	},
	Floresta = {
		ClockTime = 2,
		Brightness = 1.1,
		Ambient = rgb(44, 56, 46),
		OutdoorAmbient = rgb(56, 72, 60),
		Density = 0.55,
		Haze = 2.8,
		AtmosColor = rgb(70, 90, 75),
		Decay = rgb(40, 60, 45),
		Tint = rgb(205, 226, 208),
		Saturation = -0.35,
		Contrast = 0.15,
	},
	Moinho = {
		ClockTime = 17.9,
		Brightness = 1.3,
		Ambient = rgb(76, 54, 44),
		OutdoorAmbient = rgb(104, 72, 58),
		Density = 0.34,
		Haze = 2,
		AtmosColor = rgb(150, 110, 90),
		Decay = rgb(120, 60, 40),
		Tint = rgb(242, 220, 200),
		Saturation = -0.15,
		Contrast = 0.15,
	},
}

local function getOrCreate(className: string, name: string): Instance
	local existing = Lighting:FindFirstChild(name)
	if existing and existing:IsA(className) then
		return existing
	end
	local inst = Instance.new(className)
	inst.Name = name
	inst.Parent = Lighting
	return inst
end

local atmos = getOrCreate("Atmosphere", "AtmosferaTerror") :: Atmosphere
local cc = getOrCreate("ColorCorrectionEffect", "CorTerror") :: ColorCorrectionEffect
local bloom = getOrCreate("BloomEffect", "BrilhoTerror") :: BloomEffect
bloom.Intensity = 0.6
bloom.Size = 30
bloom.Threshold = 1.6

function Atmosphere.apply(name: string, instant: boolean?)
	local p = PRESETS[name] or PRESETS.Lobby
	Lighting.GlobalShadows = true
	Lighting.EnvironmentDiffuseScale = 0.2
	Lighting.EnvironmentSpecularScale = 0.3
	local t = if instant then 0 else 2
	local info = TweenInfo.new(t, Enum.EasingStyle.Sine)
	Lighting.ClockTime = p.ClockTime
	TweenService:Create(Lighting, info, {
		Brightness = p.Brightness,
		Ambient = p.Ambient,
		OutdoorAmbient = p.OutdoorAmbient,
	}):Play()
	TweenService:Create(atmos, info, {
		Density = p.Density,
		Haze = p.Haze,
		Color = p.AtmosColor,
		Decay = p.Decay,
		Glare = 0,
		Offset = 0.1,
	}):Play()
	TweenService:Create(cc, info, {
		TintColor = p.Tint,
		Saturation = p.Saturation,
		Contrast = p.Contrast,
		Brightness = -0.02,
	}):Play()
end

return Atmosphere
