"use client";

import React from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    Box,
    IconButton,
    useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';

interface AddMinerModalProps {
    open: boolean;
    onClose: () => void;
}

export default function AddMinerModal({ open, onClose }: AddMinerModalProps) {
    const theme = useTheme();

    return (
        <Dialog 
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
            aria-labelledby="add-miner-modal-title"
            sx={{
                '& .MuiDialog-paper': {
                    borderRadius: 2,
                    padding: 2,
                    background: theme.palette.mode === 'dark' 
                        ? 'linear-gradient(135deg, rgba(66,66,66,0.95) 0%, rgba(33,33,33,0.95) 100%)'
                        : 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(248,248,248,0.95) 100%)',
                }
            }}
        >
            {/* Close button */}
            <IconButton
                aria-label="close"
                onClick={onClose}
                sx={{
                    position: 'absolute',
                    right: 8,
                    top: 8,
                    color: theme.palette.grey[500],
                }}
            >
                <CloseIcon />
            </IconButton>

            {/* Title with icon */}
            <DialogTitle
                id="add-miner-modal-title"
                sx={{
                    textAlign: 'center',
                    pt: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1,
                }}
            >
                <RocketLaunchIcon 
                    sx={{ 
                        fontSize: '2rem',
                        color: theme.palette.primary.main,
                    }} 
                />
                <Typography
                    variant="h4"
                    component="span"
                    sx={{
                        fontWeight: 600,
                        background: 'linear-gradient(135deg, #00C6FF 0%, #0072FF 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                    }}
                >
                    Coming very soon!
                </Typography>
            </DialogTitle>

            {/* Content */}
            <DialogContent>
                <Box sx={{ 
                    py: 3,
                    px: { xs: 2, sm: 4 },
                    textAlign: 'center',
                }}>
                    <Typography
                        variant="body1"
                        sx={{
                            color: theme.palette.text.secondary,
                            lineHeight: 1.8,
                            fontSize: '1.1rem',
                        }}
                    >
                        Soon, you'll be able to explore the latest miners and purchase them directly 
                        from your dashboard. Place orders to start mining within minutes, or secure 
                        preorders for upcoming models. Easily track your delivery, activation, and 
                        all other essential details about your new miners—right from your dashboard.
                    </Typography>
                </Box>
            </DialogContent>

            {/* Actions */}
            <DialogActions sx={{ pb: 3, px: 3, justifyContent: 'center' }}>
                <Button
                    onClick={onClose}
                    variant="contained"
                    sx={{
                        borderRadius: 2,
                        px: 4,
                        py: 1,
                        textTransform: 'none',
                        fontSize: '1rem',
                        background: 'linear-gradient(135deg, #00C6FF 0%, #0072FF 100%)',
                        '&:hover': {
                            background: 'linear-gradient(135deg, #0072FF 0%, #00C6FF 100%)',
                        }
                    }}
                >
                    Got it!
                </Button>
            </DialogActions>
        </Dialog>
    );
}