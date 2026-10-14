async function handle(interaction, ctx, customId) {
    const player = ctx.manager.players.get(interaction.guild.id);

    // Player đã chết hoặc không tồn tại
    if (!player) {
        if (customId === 'np_stop') {
            await ctx.playerService.forceCleanupVoice(interaction.guild.id);
            const embed = NowPlayingUI.createStopped('stopped');
            return interaction.update({ content: '', embeds: [embed], components: [] }).catch(() => {
                return interaction.editReply({ content: '', embeds: [embed], components: [] }).catch(() => { });
            });
        }
        return respondEphemeral(interaction, t('common.noPlayer'));
    }

    const memberVoice = interaction.member?.voice?.channel;
    if (!memberVoice || (player.voiceId && memberVoice.id !== player.voiceId)) {
        return respondEphemeral(interaction, t('common.needSameVoice'));
    }

    const state = getState(interaction.guild.id);

    if (isEphemeralMessage(interaction.message)) {
        ctx.playerService.registerEphemeralContext(interaction, player);
    }
    state.touchPanel();

    await interaction.deferUpdate();

    switch (customId) {
        case 'np_previous': {
            const result = await ctx.playerService.previous(player);
            if (!result.ok) {
                await respondEphemeral(interaction, t(result.error));
                return;
            }
            await refreshPanel(interaction, player, state);
            return;
        }

        case 'np_pause_resume': {
            if (player.paused) ctx.playerService.resume(player);
            else ctx.playerService.pause(player);
            await refreshPanel(interaction, player, state);
            return;
        }

        case 'np_skip': {
            const ok = ctx.playerService.skip(player);
            if (!ok) await respondEphemeral(interaction, t('common.noPlaying'));
            return;
        }

        case 'np_repeat': {
            state.cycleRepeatMode();
            ctx.playerService.persistState(interaction.guild.id, state, player.volume);
            await refreshPanel(interaction, player, state);
            return;
        }

        case 'np_shuffle': {
            if (player.queue.length > 1) {
                const count = ctx.queueService.shuffle(player);
                await refreshPanel(interaction, player, state);
                await respondEphemeral(interaction, t('commands.shuffle.done', { count }));
            } else {
                await respondEphemeral(interaction, t('commands.shuffle.needMore'));
            }
            return;
        }

        case 'np_vol_down':
        case 'np_vol_up': {
            const delta = customId === 'np_vol_up' ? VOLUME_STEP : -VOLUME_STEP;
            const newVolume = Math.max(VOLUME_MIN, Math.min(VOLUME_MAX, (player.volume || 100) + delta));
            await player.setVolume(newVolume);
            ctx.playerService.persistState(interaction.guild.id, state, newVolume);
            await refreshPanel(interaction, player, state);
            return;
        }

        case 'np_autoplay': {
            ctx.playerService.setAutoplay(player, !state.autoplay);
            await refreshPanel(interaction, player, state);
            return;
        }

        case 'np_queue': {
            const { embed, components } = QueueUI.create(player, 1);
            await interaction.followUp({ embeds: [embed], components, flags: MessageFlags.Ephemeral });
            return;
        }

        case 'np_stop': {
            await ctx.playerService.stop(player);
            const embed = NowPlayingUI.createStopped('stopped');
            await interaction.editReply({ content: '', embeds: [embed], components: [] }).catch(() => { });
            return;
        }

        default:
            ctx.logger.debug(`Nút "${customId}" chưa được xử lý.`);
    }
}