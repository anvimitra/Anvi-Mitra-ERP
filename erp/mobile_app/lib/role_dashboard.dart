import 'package:flutter/material.dart';
import 'ui_kit.dart';

class RoleDashboard extends StatelessWidget {
  final String role;
  final Map<String,dynamic> user;
  const RoleDashboard({super.key,required this.role,required this.user});

  List<Map<String,String>> items(){
    switch(role){
      case 'teacher': return [{'t':'Attendance','d':'Mark and review class attendance'},{'t':'Homework','d':'Create and manage homework'},{'t':'Timetable','d':'Teaching timetable'},{'t':'Exams','d':'Marks and assessments'},{'t':'Students','d':'Assigned students'}];
      case 'parent': return [{'t':'My Children','d':'Linked children overview'},{'t':'Attendance','d':'Daily and monthly attendance'},{'t':'Homework','d':'Latest class homework'},{'t':'Fees','d':'Balance and receipts'},{'t':'Results','d':'Published results'},{'t':'Notifications','d':'School updates'}];
      case 'student': return [{'t':'Attendance','d':'Your attendance'},{'t':'Homework','d':'Assigned homework'},{'t':'Timetable','d':'Class timetable'},{'t':'Results','d':'Published results'},{'t':'Notifications','d':'School updates'}];
      case 'driver': return [{'t':'Trips','d':'Today transport trips'},{'t':'Route','d':'Assigned route and stops'},{'t':'Updates','d':'Transport notices'}];
      default: return [{'t':'Students','d':'Profiles and enrollments'},{'t':'Attendance','d':'School attendance'},{'t':'Fees','d':'Fees and collections'},{'t':'Exams','d':'FA1, FA2, FA3, Half Yearly and Yearly'},{'t':'Reports','d':'School analytics and reports'}];
    }
  }

  @override Widget build(BuildContext context){final data=items();return ListView(padding:const EdgeInsets.all(16),children:[GradientHeader(title:'Good morning',subtitle:'${role.replaceAll('_',' ').toUpperCase()} • ${user['schoolName']??'Your School'}'),const SizedBox(height:18),Text('Quick Access',style:Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight:FontWeight.w800)),const SizedBox(height:10),GridView.builder(shrinkWrap:true,physics:const NeverScrollableScrollPhysics(),itemCount:data.length,gridDelegate:const SliverGridDelegateWithMaxCrossAxisExtent(maxCrossAxisExtent:220,crossAxisSpacing:12,mainAxisSpacing:12,childAspectRatio:1.05),itemBuilder:(c,i){final x=data[i];return AnimatedAppCard(onTap:()=>ScaffoldMessenger.of(c).showSnackBar(SnackBar(content:Text('${x['t']} screen is ready for API wiring.'))),child:Padding(padding:const EdgeInsets.all(16),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Icon(_icon(x['t']!),size:30),const Spacer(),Text(x['t']!,style:Theme.of(c).textTheme.titleMedium?.copyWith(fontWeight:FontWeight.w700)),const SizedBox(height:5),Text(x['d']!,style:Theme.of(c).textTheme.bodySmall)])));})]);}
  IconData _icon(String x)=>switch(x){'Attendance'=>Icons.fact_check,'Homework'=>Icons.menu_book,'Timetable'=>Icons.calendar_month,'Fees'=>Icons.account_balance_wallet,'Results'=>Icons.emoji_events,'Notifications'=>Icons.notifications_active,'Students'=>Icons.groups,'Exams'=>Icons.assignment,'Reports'=>Icons.analytics,'Trips'=>Icons.directions_bus,'Route'=>Icons.route,'Updates'=>Icons.campaign,_=>Icons.dashboard};
}
