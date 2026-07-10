package com.catsnap.auth;

import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
public class EmailService {

    private final JavaMailSender mailSender;

    public EmailService(JavaMailSender mailSender) {
        this.mailSender = mailSender;
    }

    public void sendVerificationEmail(String to, String code) {
        SimpleMailMessage msg = new SimpleMailMessage();
        msg.setTo(to);
        msg.setFrom("noreply@catsnap.local");
        msg.setSubject("Verify your Catsnap account");
        msg.setText("Your verification code is: " + code + "\n\nThis code expires in 15 minutes.");
        mailSender.send(msg);
    }
}
