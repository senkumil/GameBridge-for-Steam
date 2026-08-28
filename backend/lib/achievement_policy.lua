return function()
local M = {}

local function normalized_text(item)
    local text = (tostring(item.name or "") .. " " .. tostring(item.display_name or item.title or "")
        .. " " .. tostring(item.description or "")):lower()
    text = text:gsub("á", "a"):gsub("é", "e"):gsub("í", "i"):gsub("ó", "o"):gsub("ú", "u")
    text = text:gsub("à", "a"):gsub("è", "e"):gsub("ì", "i"):gsub("ò", "o"):gsub("ù", "u")
    text = text:gsub("ä", "a"):gsub("ë", "e"):gsub("ï", "i"):gsub("ö", "o"):gsub("ü", "u")
    return text
end

function M.is_online(item)
    local text = normalized_text(item or {})
    local words = {
        "online", "multiplayer", "multijugador", "multijogador", "multigiocatore", "multijoueur",
        "mehrspieler", "coop", "co%-op", "cooperativo", "cooperativa", "kooperativ", "pvp",
        "matchmaking", "ranked", "clasificatoria", "ranqueada", "classificata", "rangliste",
        "server", "servidor", "serveur", "lobby", "leaderboard", "deathmatch",
    }
    for _, word in ipairs(words) do
        if text:match("%f[%w]" .. word .. "%f[%W]") then return true end
    end
    local phrases = {
        "en linea", "em linha", "en ligne", "partida publica", "public match", "ranked match",
        "online match", "online game", "invite a friend", "invita a un amigo", "with a friend",
        "con un amigo", "avec un ami", "mit einem freund",
    }
    for _, phrase in ipairs(phrases) do if text:find(phrase, 1, true) then return true end end
    return false
end

return M
end
