-- Hud: a interface na tela (relógio, papel, vida, estamina, habilidades, avisos).

local TweenService = game:GetService("TweenService")

local Hud = {}

local function new(className: string, props: { [string]: any }): any
	local inst = Instance.new(className)
	for k, v in props do
		if k ~= "Parent" then
			(inst :: any)[k] = v
		end
	end
	inst.Parent = props.Parent
	return inst
end

local function corner(parent: Instance, r: number?)
	new("UICorner", { Parent = parent, CornerRadius = UDim.new(0, r or 8) })
end

local function bar(parent: Instance, pos: UDim2, size: UDim2, color: Color3, labelText: string)
	local back = new("Frame", {
		Parent = parent,
		Position = pos,
		Size = size,
		BackgroundColor3 = Color3.fromRGB(20, 14, 14),
		BackgroundTransparency = 0.2,
		BorderSizePixel = 0,
	})
	corner(back, 6)
	local fill = new("Frame", {
		Parent = back,
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = color,
		BorderSizePixel = 0,
	})
	corner(fill, 6)
	local label = new("TextLabel", {
		Parent = back,
		Size = UDim2.fromScale(1, 1),
		BackgroundTransparency = 1,
		Font = Enum.Font.GothamBold,
		TextSize = 14,
		TextColor3 = Color3.fromRGB(255, 255, 255),
		TextStrokeTransparency = 0.5,
		Text = labelText,
	})
	return fill, label, back
end

function Hud.create(playerGui: PlayerGui)
	local gui = new("ScreenGui", {
		Parent = playerGui,
		Name = "HudTerror",
		ResetOnSpawn = false,
		IgnoreGuiInset = true,
		ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
	})

	-- Vinheta vermelha (raio de terror) — quatro bordas com degradê
	local vignette = new("Frame", { Parent = gui, Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1, ZIndex = 0 })
	local edges = {}
	for _, data in {
		{ UDim2.fromScale(1, 0.35), UDim2.fromScale(0, 0), 90 },
		{ UDim2.fromScale(1, 0.35), UDim2.fromScale(0, 0.65), -90 },
		{ UDim2.fromScale(0.3, 1), UDim2.fromScale(0, 0), 0 },
		{ UDim2.fromScale(0.3, 1), UDim2.fromScale(0.7, 0), 180 },
	} do
		local f = new("Frame", {
			Parent = vignette,
			Size = data[1],
			Position = data[2],
			BackgroundColor3 = Color3.fromRGB(150, 0, 0),
			BorderSizePixel = 0,
			BackgroundTransparency = 1,
		})
		new("UIGradient", {
			Parent = f,
			Rotation = data[3],
			Transparency = NumberSequence.new({
				NumberSequenceKeypoint.new(0, 0),
				NumberSequenceKeypoint.new(1, 1),
			}),
		})
		table.insert(edges, f)
	end

	-- Tela de dano / flash
	local flash = new("Frame", {
		Parent = gui,
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Color3.fromRGB(180, 0, 0),
		BackgroundTransparency = 1,
		BorderSizePixel = 0,
		ZIndex = 1,
	})

	-- Topo: fase + relógio + status
	local top = new("Frame", {
		Parent = gui,
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 44),
		Size = UDim2.fromOffset(460, 104),
		BackgroundColor3 = Color3.fromRGB(14, 8, 8),
		BackgroundTransparency = 0.25,
		BorderSizePixel = 0,
	})
	corner(top, 10)
	new("UIStroke", { Parent = top, Color = Color3.fromRGB(110, 20, 16), Thickness = 2 })
	local phase = new("TextLabel", {
		Parent = top,
		Position = UDim2.fromOffset(0, 4),
		Size = UDim2.new(1, 0, 0, 26),
		BackgroundTransparency = 1,
		Font = Enum.Font.Creepster,
		TextSize = 26,
		TextColor3 = Color3.fromRGB(220, 40, 30),
		Text = "COLHEITA SOMBRIA",
	})
	local timer = new("TextLabel", {
		Parent = top,
		Position = UDim2.fromOffset(0, 28),
		Size = UDim2.new(1, 0, 0, 40),
		BackgroundTransparency = 1,
		Font = Enum.Font.GothamBlack,
		TextSize = 36,
		TextColor3 = Color3.fromRGB(245, 235, 220),
		Text = "",
	})
	local statusLabel = new("TextLabel", {
		Parent = top,
		Position = UDim2.fromOffset(10, 70),
		Size = UDim2.new(1, -20, 0, 28),
		BackgroundTransparency = 1,
		Font = Enum.Font.Gotham,
		TextSize = 15,
		TextWrapped = true,
		TextColor3 = Color3.fromRGB(200, 190, 180),
		Text = "",
	})

	-- Info extra embaixo do topo (voto, chance, geradores)
	local info = new("TextLabel", {
		Parent = gui,
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 154),
		Size = UDim2.fromOffset(460, 24),
		BackgroundTransparency = 1,
		Font = Enum.Font.GothamBold,
		TextSize = 16,
		TextColor3 = Color3.fromRGB(240, 210, 150),
		TextStrokeTransparency = 0.4,
		Text = "",
	})

	-- Painel inferior esquerdo: papel, vida e estamina
	local panel = new("Frame", {
		Parent = gui,
		AnchorPoint = Vector2.new(0, 1),
		Position = UDim2.new(0, 20, 1, -20),
		Size = UDim2.fromOffset(270, 96),
		BackgroundColor3 = Color3.fromRGB(14, 8, 8),
		BackgroundTransparency = 0.3,
		BorderSizePixel = 0,
	})
	corner(panel, 10)
	local role = new("TextLabel", {
		Parent = panel,
		Position = UDim2.fromOffset(12, 6),
		Size = UDim2.new(1, -24, 0, 26),
		BackgroundTransparency = 1,
		Font = Enum.Font.Creepster,
		TextSize = 24,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = Color3.fromRGB(230, 220, 200),
		Text = "NO LOBBY",
	})
	local hpFill, hpLabel, hpBack = bar(panel, UDim2.fromOffset(12, 38), UDim2.new(1, -24, 0, 20), Color3.fromRGB(190, 40, 40), "Vida")
	local stFill, stLabel, stBack = bar(panel, UDim2.fromOffset(12, 64), UDim2.new(1, -24, 0, 20), Color3.fromRGB(230, 190, 70), "Estamina")

	-- Painel inferior direito: habilidades
	local abilities = new("Frame", {
		Parent = gui,
		AnchorPoint = Vector2.new(1, 1),
		Position = UDim2.new(1, -20, 1, -20),
		Size = UDim2.fromOffset(260, 110),
		BackgroundTransparency = 1,
	})
	new("UIListLayout", {
		Parent = abilities,
		Padding = UDim.new(0, 6),
		VerticalAlignment = Enum.VerticalAlignment.Bottom,
		HorizontalAlignment = Enum.HorizontalAlignment.Right,
	})
	local abilityRows = {}
	for i = 1, 3 do
		local row = new("Frame", {
			Parent = abilities,
			Size = UDim2.fromOffset(260, 30),
			BackgroundColor3 = Color3.fromRGB(14, 8, 8),
			BackgroundTransparency = 0.3,
			BorderSizePixel = 0,
			LayoutOrder = i,
			Visible = false,
		})
		corner(row, 6)
		local fill = new("Frame", {
			Parent = row,
			Size = UDim2.fromScale(0, 1),
			BackgroundColor3 = Color3.fromRGB(120, 30, 24),
			BackgroundTransparency = 0.3,
			BorderSizePixel = 0,
		})
		corner(fill, 6)
		local text = new("TextLabel", {
			Parent = row,
			Position = UDim2.fromOffset(10, 0),
			Size = UDim2.new(1, -20, 1, 0),
			BackgroundTransparency = 1,
			Font = Enum.Font.GothamBold,
			TextSize = 15,
			TextXAlignment = Enum.TextXAlignment.Left,
			TextColor3 = Color3.fromRGB(240, 230, 220),
			Text = "",
		})
		table.insert(abilityRows, { row = row, fill = fill, text = text })
	end

	-- Avisos (toasts) no centro
	local toasts = new("Frame", {
		Parent = gui,
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0.62, 0),
		Size = UDim2.fromOffset(520, 160),
		BackgroundTransparency = 1,
	})
	new("UIListLayout", { Parent = toasts, Padding = UDim.new(0, 4), HorizontalAlignment = Enum.HorizontalAlignment.Center })

	-- Resultado
	local result = new("Frame", {
		Parent = gui,
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Color3.fromRGB(0, 0, 0),
		BackgroundTransparency = 1,
		Visible = false,
		ZIndex = 5,
	})
	local resultTitle = new("TextLabel", {
		Parent = result,
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.44),
		Size = UDim2.new(0.9, 0, 0, 90),
		BackgroundTransparency = 1,
		Font = Enum.Font.Creepster,
		TextScaled = true,
		TextColor3 = Color3.fromRGB(220, 30, 24),
		Text = "",
		ZIndex = 6,
	})
	local resultSub = new("TextLabel", {
		Parent = result,
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.fromScale(0.5, 0.52),
		Size = UDim2.new(0.8, 0, 0, 30),
		BackgroundTransparency = 1,
		Font = Enum.Font.GothamBold,
		TextSize = 22,
		TextColor3 = Color3.fromRGB(230, 220, 210),
		Text = "",
		ZIndex = 6,
	})

	-- Botão de assistir (para quem morreu / está no lobby durante a partida)
	local spectate = new("TextButton", {
		Parent = gui,
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -24),
		Size = UDim2.fromOffset(220, 40),
		BackgroundColor3 = Color3.fromRGB(60, 14, 12),
		BorderSizePixel = 0,
		Font = Enum.Font.GothamBold,
		TextSize = 16,
		TextColor3 = Color3.fromRGB(240, 230, 220),
		Text = "Assistir partida",
		Visible = false,
	})
	corner(spectate, 8)

	local self = {
		gui = gui,
		edges = edges,
		flash = flash,
		phase = phase,
		timer = timer,
		status = statusLabel,
		info = info,
		role = role,
		hpFill = hpFill,
		hpLabel = hpLabel,
		hpBack = hpBack,
		stFill = stFill,
		stLabel = stLabel,
		stBack = stBack,
		abilityRows = abilityRows,
		toasts = toasts,
		result = result,
		resultTitle = resultTitle,
		resultSub = resultSub,
		spectate = spectate,
	}

	function self.toast(text: string, color: Color3?)
		local label = new("TextLabel", {
			Parent = toasts,
			Size = UDim2.fromOffset(520, 30),
			BackgroundTransparency = 1,
			Font = Enum.Font.GothamBlack,
			TextSize = 22,
			TextColor3 = color or Color3.fromRGB(240, 230, 220),
			TextStrokeTransparency = 0.3,
			Text = text,
		})
		task.delay(3.2, function()
			local tw = TweenService:Create(label, TweenInfo.new(0.6), { TextTransparency = 1, TextStrokeTransparency = 1 })
			tw:Play()
			tw.Completed:Wait()
			label:Destroy()
		end)
		local kids = 0
		for _, c in toasts:GetChildren() do
			if c:IsA("TextLabel") then
				kids += 1
			end
		end
		if kids > 4 then
			for _, c in toasts:GetChildren() do
				if c:IsA("TextLabel") and c ~= label then
					c:Destroy()
					break
				end
			end
		end
	end

	function self.hitFlash(color: Color3?, strength: number?)
		flash.BackgroundColor3 = color or Color3.fromRGB(180, 0, 0)
		flash.BackgroundTransparency = 1 - (strength or 0.5)
		TweenService:Create(flash, TweenInfo.new(0.6), { BackgroundTransparency = 1 }):Play()
	end

	function self.showResult(title: string, sub: string, color: Color3)
		result.Visible = true
		result.BackgroundTransparency = 1
		resultTitle.Text = title
		resultTitle.TextColor3 = color
		resultTitle.TextTransparency = 1
		resultSub.Text = sub
		resultSub.TextTransparency = 1
		TweenService:Create(result, TweenInfo.new(0.8), { BackgroundTransparency = 0.35 }):Play()
		TweenService:Create(resultTitle, TweenInfo.new(0.8), { TextTransparency = 0 }):Play()
		TweenService:Create(resultSub, TweenInfo.new(1.2), { TextTransparency = 0 }):Play()
		task.delay(6, function()
			local tw = TweenService:Create(result, TweenInfo.new(0.8), { BackgroundTransparency = 1 })
			TweenService:Create(resultTitle, TweenInfo.new(0.8), { TextTransparency = 1 }):Play()
			TweenService:Create(resultSub, TweenInfo.new(0.8), { TextTransparency = 1 }):Play()
			tw:Play()
			tw.Completed:Wait()
			result.Visible = false
		end)
	end

	function self.setTerror(amount: number)
		for _, e in edges do
			e.BackgroundTransparency = 1 - math.clamp(amount, 0, 1) * 0.75
		end
	end

	return self
end

return Hud
