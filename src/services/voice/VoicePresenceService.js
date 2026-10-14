async handle(_oldState, newState) {
    const guild = newState.guild || _oldState?.guild;
    if (!guild) return;

    const botId = this.client.user?.id;
    const player = this.manager?.players?.get(guild.id);

    // Nếu sự kiện này chính là của bot và bot vừa rời khỏi kênh thoại
    if (botId && newState.id === botId && !newState.channelId) {
        this.cancel(guild.id);
        if (player) await this.onIdle(guild.id);
        return;
    }

    // Lấy kênh thoại thực tế của bot từ Discord trước, chỉ fallback sang player/shoukaku khi cache chưa có
    const discordBotVoiceId =
        guild.voiceStates?.cache?.get(botId)?.channelId ?? guild.members?.me?.voice?.channelId;
    const botVoiceChannelId =
        discordBotVoiceId !== undefined
            ? discordBotVoiceId
            : player?.voiceId || this.manager?.shoukaku?.connections?.get(guild.id)?.channelId;

    if (!botVoiceChannelId) {
        this.cancel(guild.id);
        return;
    }

    // Đồng bộ lại voiceId của player nếu bot được chuyển sang phòng khác
    if (player && player.voiceId && player.voiceId !== botVoiceChannelId) {
        player.voiceId = botVoiceChannelId;
    }

    // Đếm số người dùng (không phải bot) trong kênh thoại
    let humans = 0;

    if (guild.voiceStates?.cache?.size) {
        for (const vs of guild.voiceStates.cache.values()) {
            if (vs.channelId !== botVoiceChannelId) continue;
            if (vs.id === botId) continue;
            if (vs.id === newState.id && newState.channelId !== botVoiceChannelId) continue;
            if (vs.member?.user?.bot) continue;
            humans++;
        }
    } else {
        const channel =
            guild.channels.cache.get(botVoiceChannelId) ||
            (await guild.channels.fetch(botVoiceChannelId).catch(() => null));
        if (channel?.members) {
            for (const member of channel.members.values()) {
                if (member.id === botId || member.user?.bot) continue;
                if (member.id === newState.id && newState.channelId !== botVoiceChannelId) continue;
                humans++;
            }
        }
    }

    if (humans > 0) {
        this.cancel(guild.id);
        return;
    }

    this.schedule(guild.id);
}