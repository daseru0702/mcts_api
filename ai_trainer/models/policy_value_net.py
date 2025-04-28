# ai_trainer/models/policy_value_net.py

import torch
import torch.nn as nn
import torch.nn.functional as F

class PolicyValueNet(nn.Module):
    def __init__(self,
                 in_channels: int,
                 board_size: int,
                 policy_output_dim: int,
                 num_filters: int = 64,
                 num_res_blocks: int = 4):
        super().__init__()
        # 입력 컨볼루션
        self.conv = nn.Conv2d(in_channels, num_filters, kernel_size=3, padding=1)
        # Residual block들
        self.res_blocks = nn.ModuleList([
            nn.Sequential(
                nn.Conv2d(num_filters, num_filters, 3, padding=1),
                nn.BatchNorm2d(num_filters),
                nn.ReLU(),
                nn.Conv2d(num_filters, num_filters, 3, padding=1),
                nn.BatchNorm2d(num_filters)
            )
            for _ in range(num_res_blocks)
        ])
        # Policy 헤드
        self.policy_conv = nn.Conv2d(num_filters, 2, kernel_size=1)
        self.policy_fc   = nn.Linear(2 * board_size * board_size, policy_output_dim)
        # Value 헤드
        self.value_conv  = nn.Conv2d(num_filters, 1, kernel_size=1)
        self.value_fc1   = nn.Linear(board_size * board_size, 256)
        self.value_fc2   = nn.Linear(256, 1)

    def forward(self, x):
        # x: (batch, in_channels, board_size, board_size)
        h = F.relu(self.conv(x))
        for block in self.res_blocks:
            res = block(h)
            h   = F.relu(h + res)
        # policy
        p = F.relu(self.policy_conv(h))                  # (batch,2,N,N)
        p = p.view(p.size(0), -1)                         # (batch, 2*N*N)
        policy = F.log_softmax(self.policy_fc(p), dim=1) # (batch, policy_output_dim)
        # value
        v = F.relu(self.value_conv(h))                    # (batch,1,N,N)
        v = v.view(v.size(0), -1)                         # (batch, N*N)
        v = F.relu(self.value_fc1(v))                     # (batch, 256)
        value = torch.tanh(self.value_fc2(v))             # (batch, 1)
        return policy, value
