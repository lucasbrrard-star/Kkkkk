-- KillerBot: um Espantalho controlado pelo computador.
-- Entra quando não há jogadores suficientes (ex.: testar sozinho no Studio).

local PathfindingService = game:GetService("PathfindingService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Roles = require(script.Parent.Roles)
local Config = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Config"))

local K = Config.Killer
local KillerBot = {}

local function makeRig(): Model?
	local ok, rig = pcall(function()
		local desc = Instance.new("HumanoidDescription")
		return Players:CreateHumanoidModelFromDescription(desc, Enum.HumanoidRigType.R15)
	end)
	if ok and rig then
		return rig
	end
	warn("[KillerBot] Não foi possível criar o boneco:", rig)
	return nil
end

local function flat(v: Vector3): Vector3
	return Vector3.new(v.X, 0, v.Z)
end

function KillerBot.spawn(position: Vector3): Model?
	local rig = makeRig()
	if not rig then
		return nil
	end
	rig.Name = Config.KILLER_NAME
	rig:PivotTo(CFrame.new(position + Vector3.new(0, 3, 0)))
	rig.Parent = workspace
	local humanoid = rig:FindFirstChildOfClass("Humanoid") :: Humanoid
	local root = rig:FindFirstChild("HumanoidRootPart") :: BasePart
	if not humanoid or not root then
		rig:Destroy()
		return nil
	end
	pcall(function()
		root:SetNetworkOwner(nil)
	end)
	Roles.makeKiller(rig, nil)

	task.spawn(function()
		local params = RaycastParams.new()
		params.FilterType = Enum.RaycastFilterType.Exclude
		local waypoints: { PathWaypoint } = {}
		local wpIndex = 1
		local lastPath = 0
		local lastTarget: Vector3? = nil
		local wanderGoal: Vector3? = nil
		local stuckTime, lastPos = 0, root.Position

		while rig.Parent and humanoid.Health > 0 do
			local dt = task.wait(0.15)
			local st = Roles.stateOf(rig)
			if not st then
				break
			end
			if rig:GetAttribute("Frozen") or rig:GetAttribute("Stunned") then
				continue
			end

			-- alvo: sobrevivente vivo mais próximo
			local target, targetDist = nil, math.huge
			for _, s in Roles.survivors() do
				local r = s.character:FindFirstChild("HumanoidRootPart") :: BasePart?
				if r then
					local d = (r.Position - root.Position).Magnitude
					if d < targetDist then
						target, targetDist = r, d
					end
				end
			end

			if target then
				local tpos = target.Position
				params.FilterDescendantsInstances = { rig, target.Parent :: Instance }
				local blocked = workspace:Raycast(root.Position, tpos - root.Position, params) ~= nil
				if targetDist <= K.AttackRange - 1.5 then
					root.CFrame = CFrame.lookAt(root.Position, Vector3.new(tpos.X, root.Position.Y, tpos.Z))
					Roles.attack(rig)
					humanoid:MoveTo(tpos)
				elseif not blocked and targetDist < 45 then
					humanoid:MoveTo(tpos)
					waypoints = {}
					if targetDist > 14 and targetDist < 35 then
						Roles.dash(rig)
					end
				else
					if targetDist > 40 then
						Roles.howl(rig) -- avisa os sobreviventes que ele está farejando
					end
					local now = os.clock()
					if now - lastPath > 1 or not lastTarget or (lastTarget - tpos).Magnitude > 12 or wpIndex > #waypoints then
						lastPath = now
						lastTarget = tpos
						local path = PathfindingService:CreatePath({ AgentRadius = 2.5, AgentHeight = 6, AgentCanJump = true, WaypointSpacing = 6 })
						local ok = pcall(function()
							path:ComputeAsync(root.Position, tpos)
						end)
						if ok and path.Status == Enum.PathStatus.Success then
							waypoints = path:GetWaypoints()
							wpIndex = math.min(2, #waypoints)
						else
							waypoints = {}
							humanoid:MoveTo(tpos)
						end
					end
					local wp = waypoints[wpIndex]
					if wp then
						if flat(wp.Position - root.Position).Magnitude < 3.5 then
							wpIndex += 1
							wp = waypoints[wpIndex]
						end
						if wp then
							if wp.Action == Enum.PathWaypointAction.Jump then
								humanoid.Jump = true
							end
							humanoid:MoveTo(wp.Position)
						end
					end
				end
			else
				-- ninguém vivo: anda à toa
				if not wanderGoal or flat(wanderGoal - root.Position).Magnitude < 4 then
					wanderGoal = root.Position + Vector3.new(math.random(-40, 40), 0, math.random(-40, 40))
				end
				humanoid:MoveTo(wanderGoal)
			end

			-- destravar se ficar preso
			if (root.Position - lastPos).Magnitude < 0.3 and humanoid.WalkSpeed > 0 then
				stuckTime += dt
				if stuckTime > 1.2 then
					humanoid.Jump = true
					waypoints = {}
					stuckTime = 0
				end
			else
				stuckTime = 0
			end
			lastPos = root.Position
		end
	end)
	return rig
end

return KillerBot
